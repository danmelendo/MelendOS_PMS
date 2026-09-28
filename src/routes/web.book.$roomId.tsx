import { PaymentChoice } from "@/components/PaymentChoice";
import type { PaymentMode } from "@domain/policies.ts";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ArrowLeft, CalendarDays, Users, Clock, ShieldCheck, Sparkles, Tag } from "lucide-react";
import { toast } from "sonner";
import { pms } from "@/integrations/pms";
import { eur, formatDateLong } from "@/lib/stays";
import { useBrand } from "@/lib/brand";
import { findPromo, type AppliedPromo } from "@/lib/offers";
import { promoDiscount } from "@domain/pricing.ts";
import { currentLang, useLang } from "@/lib/i18n";

interface WebBookSearch {
  checkIn: string;
  checkOut: string;
  guests: number;
  /** Promo code from "Habitaciones en oferta". */
  promo?: string;
}

export const Route = createFileRoute("/web/book/$roomId")({
  component: WebBookScreen,
  validateSearch: (s: Record<string, unknown>): WebBookSearch => ({
    checkIn: String(s.checkIn ?? ""),
    checkOut: String(s.checkOut ?? ""),
    guests: Number(s.guests ?? 1),
    ...(typeof s.promo === "string" && s.promo ? { promo: s.promo.slice(0, 40) } : {}),
  }),
});

async function findPropertyForRoom(roomId: string): Promise<string | null> {
  const properties = await pms.listProperties();
  for (const p of properties) {
    const rooms = await pms.listRooms(p.id);
    if (rooms.some((r) => r.id === roomId)) return p.id;
  }
  return null;
}

function WebBookScreen() {
  const { roomId } = Route.useParams();
  const { checkIn, checkOut, guests, promo: promoFromLink } = Route.useSearch();
  const navigate = useNavigate();
  const { tenantId } = useBrand();
  const { t } = useLang();
  // Guest details (no account needed).
  const [guest, setGuest] = useState({ name: "", email: "", phone: "" });
  const guestValid = guest.name.trim().length >= 2 && /^\S+@\S+\.\S+$/.test(guest.email.trim());

  const { data: propertyId } = useQuery({
    queryKey: ["pms", "room-property", roomId],
    queryFn: () => findPropertyForRoom(roomId),
  });

  const { data: room } = useQuery({
    queryKey: ["pms", "room", roomId, propertyId],
    enabled: !!propertyId,
    queryFn: async () => {
      const rooms = await pms.listRooms(propertyId!);
      return rooms.find((r) => r.id === roomId) ?? null;
    },
  });

  const { data: offer } = useQuery({
    queryKey: ["pms", "availability-room", propertyId, roomId, checkIn, checkOut],
    enabled: !!propertyId,
    queryFn: async () => {
      const offers = await pms.searchAvailability({
        propertyId: propertyId!,
        checkIn,
        checkOut,
        guests,
      });
      return offers.find((o) => o.room.id === roomId) ?? null;
    },
  });

  // Promo code: checked here to show the discount; the server checks it again.
  const [promoInput, setPromoInput] = useState(promoFromLink ?? "");
  const [promo, setPromo] = useState<AppliedPromo | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);
  const applyPromo = useMutation({
    mutationFn: async (code: string) => {
      if (!tenantId) throw new Error(t("Hotel no disponible"));
      return findPromo(tenantId, code);
    },
    onSuccess: (p) => {
      setPromo(p);
      setPromoError(p ? null : "Código no válido o caducado");
    },
    onError: (e: Error) => setPromoError(e.message),
  });
  useEffect(() => {
    if (promoFromLink && tenantId && !promo && !applyPromo.isPending && !applyPromo.isSuccess) {
      applyPromo.mutate(promoFromLink);
    }
  }, [promoFromLink, tenantId, promo, applyPromo]);

  const create = useMutation({
    mutationFn: async ({ mode, hold }: { mode: PaymentMode; hold: boolean }) => {
      if (!room || !propertyId) throw new Error(t("Habitación no disponible"));
      const prebooking = await pms.createPrebooking({
        guest: {
          name: guest.name.trim(),
          email: guest.email.trim(),
          ...(guest.phone.trim() ? { phone: guest.phone.trim() } : {}),
        },
        propertyId,
        roomId,
        checkIn,
        checkOut,
        guests,
        hold,
        paymentMode: mode,
        ...(promo ? { promoCode: promo.code } : {}),
        lang: currentLang(),
      });
      return { prebooking, hold, mode };
    },
    onSuccess: ({ prebooking, hold, mode }) => {
      if (mode === "at_hotel") {
        toast.success(t("Reserva confirmada · pagas en el hotel"));
        navigate({ to: "/web/booking/$bookingId", params: { bookingId: prebooking.id } });
      } else if (hold) {
        toast.success(t("Prereserva creada · tienes 30 min para confirmar"));
        navigate({ to: "/web/checkout/$bookingId", params: { bookingId: prebooking.id } });
      } else {
        navigate({
          to: "/web/checkout/$bookingId",
          params: { bookingId: prebooking.id },
          search: { auto: true },
        });
      }
    },
    onError: (e: Error) => toast.error(t(e.message || "No se pudo crear la reserva")),
  });

  const nights = offer?.nights ?? 0;
  const roomPrice = offer?.price ?? 0;
  const discount = promo
    ? promoDiscount(
        { discountType: promo.discount_type, discountValue: Number(promo.discount_value) },
        roomPrice,
      )
    : 0;
  const total = Math.round((roomPrice - discount) * 100) / 100;

  return (
    <div className="mx-auto max-w-2xl px-5 py-10">
      <div className="mb-6 flex items-center gap-3">
        <button
          onClick={() => history.back()}
          className="flex h-10 w-10 items-center justify-center  border border-neutral-200 bg-white text-neutral-700"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h1 className="text-2xl font-bold">{t("Confirma tu reserva")}</h1>
      </div>

      <div className="overflow-hidden  bg-white shadow-sm ring-1 ring-neutral-100">
        {room?.imageUrl && (
          <img src={room.imageUrl} alt={room.name} className="h-52 w-full object-cover" />
        )}
        <div className="space-y-3 p-6">
          <h2 className="text-xl font-semibold">
            {t("Habitación {name}", { name: room?.name ?? "" })}
          </h2>
          <Row icon={CalendarDays} label={t("Entrada")}>
            {formatDateLong(`${checkIn}T15:00:00`)} · 15:00
          </Row>
          <Row icon={CalendarDays} label={t("Salida")}>
            {formatDateLong(`${checkOut}T12:00:00`)} · 12:00
          </Row>
          <Row icon={Clock} label={t("Noches")}>
            {nights}
          </Row>
          <Row icon={Users} label={t("Huéspedes")}>
            {guests}
          </Row>
        </div>
      </div>

      <div className="mt-5 space-y-3 bg-white p-6 shadow-sm ring-1 ring-neutral-100">
        <h3 className="font-semibold">{t("Datos del huésped")}</h3>
        <Field label={t("Nombre y apellidos")}>
          <input
            value={guest.name}
            onChange={(e) => setGuest({ ...guest, name: e.target.value })}
            autoComplete="name"
            className="w-full border border-neutral-200 px-3 py-2.5 text-sm"
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Email">
            <input
              type="email"
              value={guest.email}
              onChange={(e) => setGuest({ ...guest, email: e.target.value })}
              autoComplete="email"
              className="w-full border border-neutral-200 px-3 py-2.5 text-sm"
            />
          </Field>
          <Field label={t("Teléfono (opcional)")}>
            <input
              type="tel"
              value={guest.phone}
              onChange={(e) => setGuest({ ...guest, phone: e.target.value })}
              autoComplete="tel"
              className="w-full border border-neutral-200 px-3 py-2.5 text-sm"
            />
          </Field>
        </div>
        <p className="text-xs text-neutral-400">
          {t("Te enviaremos la confirmación y el enlace para gestionar la reserva.")}
        </p>
      </div>

      <div className="mt-5 space-y-2 bg-white p-6 shadow-sm ring-1 ring-neutral-100">
        <h3 className="flex items-center gap-2 font-semibold">
          <Tag className="h-4 w-4 text-[var(--brand)]" /> {t("¿Tienes un código promocional?")}
        </h3>
        {promo ? (
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span>
              <span className="font-mono font-semibold">{promo.code}</span> ·{" "}
              <span className="text-emerald-700">
                {t("−{amount} en la habitación", { amount: eur(discount) })}
              </span>
            </span>
            <button
              type="button"
              onClick={() => {
                setPromo(null);
                setPromoInput("");
              }}
              className="text-xs text-neutral-500 underline-offset-4 hover:underline"
            >
              {t("Quitar")}
            </button>
          </div>
        ) : (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (promoInput.trim()) applyPromo.mutate(promoInput.trim());
            }}
          >
            <input
              value={promoInput}
              onChange={(e) => {
                setPromoInput(e.target.value.toUpperCase());
                setPromoError(null);
              }}
              placeholder={t("CÓDIGO")}
              maxLength={40}
              className="w-full border border-neutral-200 px-3 py-2.5 font-mono text-sm uppercase"
            />
            <button
              type="submit"
              disabled={!promoInput.trim() || applyPromo.isPending}
              className="shrink-0 border border-neutral-300 px-4 text-sm font-semibold disabled:opacity-50"
            >
              {t("Aplicar")}
            </button>
          </form>
        )}
        {promoError && <p className="text-xs text-red-600">{t(promoError)}</p>}
        {promo && (
          <p className="text-xs text-neutral-400">
            {eur(roomPrice)} − {eur(discount)} = {eur(total)}.{" "}
            {t("Los extras no llevan descuento.")}
          </p>
        )}
      </div>

      <PaymentChoice
        total={total}
        checkIn={checkIn}
        nights={nights}
        disabled={!offer?.available || !guestValid}
        busy={create.isPending}
        tone="web"
        onBook={(mode, hold) => create.mutate({ mode, hold })}
      />

      <Link to="/web" className="mt-6 block text-center text-xs text-neutral-400 underline">
        {t("Cancelar y volver al inicio")}
      </Link>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
        {label}
      </span>
      {children}
    </label>
  );
}

function Row({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="flex items-center gap-2 text-neutral-500">
        <Icon className="h-4 w-4" /> {label}
      </span>
      <span className="font-medium text-neutral-800">{children}</span>
    </div>
  );
}
