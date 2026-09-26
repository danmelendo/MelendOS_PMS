import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ChevronRight, LogIn, LogOut, Search, Sparkles, UserRound } from "lucide-react";
import { toast } from "sonner";
import { pms } from "@/integrations/pms";
import { adoptGuestToken } from "@/integrations/pms/demo-stays-connector";
import { supabase } from "@/integrations/supabase/client";
import { DemoAccountPicker } from "@/components/DemoAccountPicker";
import { useAuth } from "@/lib/auth";
import { useBrand } from "@/lib/brand";
import { DEMO_ACCESS } from "@/lib/demo-access";
import { useBrandTenant, useFeatures } from "@/lib/features";
import { MemberProvider, useMember } from "@/lib/member-session";
import { BOOKING_STATUS_CLASSES, BOOKING_STATUS_LABELS, formatDateShort } from "@/lib/stays";

// "My booking" on the public website: find a booking with its reference and
// email (no account needed), or sign in to see all your stays at this hotel.
export const Route = createFileRoute("/web/mi-reserva")({
  component: () => (
    <MemberProvider>
      <MyBookingPage />
    </MemberProvider>
  ),
  head: () => ({ meta: [{ title: "Mi reserva" }] }),
});

const CARD = "bg-white p-6 shadow-sm ring-1 ring-neutral-100";
const FIELD =
  "w-full border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/30";
const LABEL = "mb-1 block text-[11px] font-semibold uppercase tracking-wider text-neutral-400";

function MyBookingPage() {
  const { brand } = useBrand();
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-5">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--brand)]">
        {brand.name}
      </p>
      <h1 className="mt-1 text-3xl font-bold tracking-tight">Mi reserva</h1>
      <p className="mt-1 text-neutral-500">
        Consulta tu reserva, haz el check-in online, habla con recepción o pide lo que necesites.
      </p>
      <div className="mt-8 grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
        <FindBooking />
        <MyStays />
      </div>
    </div>
  );
}

function FindBooking() {
  const navigate = useNavigate();
  const { data: tenant } = useBrandTenant();
  const [reference, setReference] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenant) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("find_guest_booking", {
      p_tenant: tenant.id,
      p_reference: reference,
      p_email: email,
    });
    setBusy(false);
    const found = data as { id: string; token: string } | null;
    if (error || !found) {
      toast.error("No encontramos una reserva con esa referencia y ese email.");
      return;
    }
    adoptGuestToken(found.id, found.token);
    navigate({ to: "/web/booking/$bookingId", params: { bookingId: found.id } });
  };

  return (
    <section className={CARD}>
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <Search className="h-5 w-5 text-[var(--brand)]" /> Buscar mi reserva
      </h2>
      <p className="mt-1 text-sm text-neutral-500">
        Sin cuenta: con la referencia de 8 caracteres de tu confirmación y el email con el que
        reservaste.
      </p>
      <form onSubmit={submit} className="mt-5 space-y-4">
        <label className="block">
          <span className={LABEL}>Referencia</span>
          <input
            value={reference}
            onChange={(e) => setReference(e.target.value.toUpperCase())}
            maxLength={12}
            required
            placeholder="Ej. 3F9A21C0"
            autoComplete="off"
            className={`${FIELD} font-mono uppercase tracking-wider`}
          />
        </label>
        <label className="block">
          <span className={LABEL}>Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            className={FIELD}
          />
        </label>
        <button
          type="submit"
          disabled={busy || !tenant}
          className="w-full bg-[var(--brand)] py-3 font-semibold text-white disabled:opacity-50"
        >
          {busy ? "Buscando…" : "Ver mi reserva"}
        </button>
      </form>
    </section>
  );
}

function MyStays() {
  const { memberId, member, needsSignIn, loading } = useMember();
  const { signOut } = useAuth();
  const features = useFeatures();
  const { data: bookings, isPending } = useQuery({
    queryKey: ["pms", "bookings", memberId],
    enabled: !!memberId,
    queryFn: () => pms.listBookings(memberId),
  });
  const { data: loyalty } = useQuery({
    queryKey: ["pms", "loyalty", memberId],
    enabled: !!memberId && features.loyalty,
    queryFn: () => pms.getLoyaltyAccount(memberId),
  });

  if (needsSignIn) {
    return (
      <section className={CARD}>
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <UserRound className="h-5 w-5 text-[var(--brand)]" /> Entrar con mi cuenta
        </h2>
        <p className="mt-1 mb-5 text-sm text-neutral-500">
          Todas tus estancias en el hotel en un solo sitio.
        </p>
        {DEMO_ACCESS ? <DemoAccountPicker kind="guest" tone="guest" /> : <PasswordSignIn />}
      </section>
    );
  }
  if (loading || isPending) {
    return <section className={`${CARD} text-sm text-neutral-400`}>Cargando…</section>;
  }

  const upcoming = (bookings ?? []).filter((b) =>
    ["held", "confirmed", "in_progress"].includes(b.status),
  );
  const past = (bookings ?? []).filter((b) => !upcoming.includes(b)).slice(0, 5);

  return (
    <section className={CARD}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <UserRound className="h-5 w-5 text-[var(--brand)]" /> Hola, {member?.name.split(" ")[0]}
          </h2>
          <p className="truncate text-sm text-neutral-500">{member?.email}</p>
        </div>
        {
          <button
            type="button"
            onClick={() => signOut()}
            className="flex shrink-0 items-center gap-1 text-sm text-neutral-500 hover:text-neutral-800"
          >
            <LogOut className="h-4 w-4" /> Salir
          </button>
        }
      </div>

      {features.loyalty && loyalty && (
        <div className="mt-4 flex items-center justify-between gap-3 bg-neutral-50 px-4 py-3">
          <span className="flex items-center gap-2 text-sm">
            <Sparkles className="h-4 w-4 text-[var(--brand)]" /> Club · {loyalty.tier.name}
          </span>
          <span className="text-sm font-semibold tabular-nums">{loyalty.points} puntos</span>
        </div>
      )}

      <StayList title="Próximas y en curso" items={upcoming} empty="No tienes reservas próximas." />
      {past.length > 0 && <StayList title="Anteriores" items={past} />}

      <Link
        to="/web/hotels"
        className="mt-6 inline-flex items-center gap-1 text-sm font-medium text-[var(--brand)]"
      >
        Reservar otra estancia <ChevronRight className="h-4 w-4" />
      </Link>
    </section>
  );
}

function StayList({
  title,
  items,
  empty,
}: {
  title: string;
  items: Awaited<ReturnType<typeof pms.listBookings>>;
  empty?: string;
}) {
  return (
    <div className="mt-6">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-400">
        {title}
      </h3>
      {items.length === 0 && empty && <p className="text-sm text-neutral-500">{empty}</p>}
      <ul className="space-y-2">
        {items.map((b) => (
          <li key={b.id}>
            <Link
              to="/web/booking/$bookingId"
              params={{ bookingId: b.id }}
              className="flex items-center justify-between gap-3 border border-neutral-100 p-3 transition hover:border-neutral-300"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {b.roomName} · {b.propertyName}
                </p>
                <p className="text-xs text-neutral-500">
                  {formatDateShort(b.checkIn)} → {formatDateShort(b.checkOut)} · Ref. {b.reference}
                </p>
              </div>
              <span
                className={`shrink-0 border px-2 py-0.5 text-[11px] font-medium ${BOOKING_STATUS_CLASSES[b.status]}`}
              >
                {BOOKING_STATUS_LABELS[b.status]}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PasswordSignIn() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const { error } = await signIn(email.trim(), password);
        setBusy(false);
        if (error) toast.error("Email o contraseña incorrectos");
      }}
      className="space-y-4"
    >
      <label className="block">
        <span className={LABEL}>Email</span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          className={FIELD}
        />
      </label>
      <label className="block">
        <span className={LABEL}>Contraseña</span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
          className={FIELD}
        />
      </label>
      <button
        type="submit"
        disabled={busy}
        className="flex w-full items-center justify-center gap-2 bg-[var(--brand)] py-3 font-semibold text-white disabled:opacity-50"
      >
        <LogIn className="h-4 w-4" /> {busy ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
