import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  MessagesSquare,
  Home,
  ChevronRight,
  Clock,
  BellRing,
  X,
  Wrench,
  LogOut,
  LogIn,
  MapPin,
  CalendarDays,
  CheckCircle2,
  Building2,
  FileText,
} from "lucide-react";
import { toast } from "sonner";
import { pms } from "@/integrations/pms";
import { useMember } from "@/lib/member-session";
import { BOOKING_STATUS_CLASSES, BOOKING_STATUS_LABELS, eur, formatDateShort } from "@/lib/stays";
import type { Prebooking, AvailabilityWatch } from "@/integrations/pms";

export const Route = createFileRoute("/stays/trips")({
  component: PersonalArea,
});

// Front-desk requests a guest can send from the current stay card.
function PersonalArea() {
  const { memberId, member } = useMember();
  const navigate = useNavigate();

  const { data: bookings, isLoading } = useQuery({
    queryKey: ["pms", "bookings", memberId],
    queryFn: () => pms.listBookings(memberId),
    refetchInterval: 20_000,
  });
  const { data: watches } = useQuery({
    queryKey: ["pms", "watches", memberId],
    queryFn: () => pms.listWatches(memberId),
    refetchInterval: 15_000,
  });

  const list = bookings ?? [];
  const active = list.filter((b) => ["held", "confirmed", "in_progress"].includes(b.status));
  const past = list.filter((b) => ["completed", "cancelled", "expired"].includes(b.status));
  const activeWatches = (watches ?? []).filter(
    (w) => w.status === "watching" || w.status === "available",
  );

  // Current stay: the one in progress, or else the next confirmed one.
  const currentStay =
    list.find((b) => b.status === "in_progress") ?? list.find((b) => b.status === "confirmed");

  return (
    <div className="px-5 pt-6">
      <h1 className="mb-4 flex items-center gap-2 text-2xl font-semibold tracking-tight">
        <Home className="h-6 w-6 text-[var(--brand)]" /> Mi estancia
      </h1>

      {/* ── Management hub ── */}
      <div className="mb-5 grid grid-cols-3 gap-2">
        <Link to="/stays/spaces" className={HUB_CARD}>
          <span className={HUB_ICON}>
            <Building2 className="h-4 w-4" />
          </span>
          <span className={HUB_LABEL}>Instalaciones</span>
        </Link>
        <Link to="/stays/invoices" className={HUB_CARD}>
          <span className={HUB_ICON}>
            <FileText className="h-4 w-4" />
          </span>
          <span className={HUB_LABEL}>Facturas</span>
        </Link>
        <Link
          to={currentStay ? "/stays/chat/$bookingId" : "/stays/incidents"}
          params={currentStay ? { bookingId: currentStay.id } : undefined}
          className={HUB_CARD}
        >
          <span className={HUB_ICON}>
            <Wrench className="h-4 w-4" />
          </span>
          <span className={HUB_LABEL}>Peticiones</span>
        </Link>
      </div>

      {/* ── Current stay ── */}
      <div className="mb-5">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-400">
          Estancia actual
        </h2>
        {currentStay ? (
          <div className=" bg-white shadow-sm ring-1 ring-neutral-100">
            <div className="border-b border-neutral-100 p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span
                    className={` border px-2 py-0.5 text-[11px] font-medium ${BOOKING_STATUS_CLASSES[currentStay.status]}`}
                  >
                    {BOOKING_STATUS_LABELS[currentStay.status]}
                  </span>
                  <h3 className="mt-1.5 font-semibold text-neutral-900">{currentStay.roomName}</h3>
                  <p className="flex items-center gap-1 text-sm text-neutral-500">
                    <MapPin className="h-3.5 w-3.5" /> {currentStay.propertyName}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-neutral-400">
                    <CalendarDays className="h-3.5 w-3.5" />
                    {formatDateShort(currentStay.checkIn)} → {formatDateShort(currentStay.checkOut)}
                  </p>
                </div>
                <Link
                  to="/stays/booking/$bookingId"
                  params={{ bookingId: currentStay.id }}
                  className="shrink-0 text-[var(--brand)]"
                >
                  <ChevronRight className="h-5 w-5" />
                </Link>
              </div>
            </div>

            {/* Front-desk requests */}
            <div className="p-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-400">
                Recepción
              </p>
              <div className="grid grid-cols-3 gap-2">
                <PortalAction
                  icon={MessagesSquare}
                  label="Chat con recepción"
                  onClick={() =>
                    navigate({
                      to: "/stays/chat/$bookingId",
                      params: { bookingId: currentStay.id },
                    })
                  }
                  color="bg-sky-50 text-sky-700 ring-sky-100"
                />
                <PortalAction
                  icon={LogIn}
                  label="Early check-in"
                  onClick={() =>
                    navigate({
                      to: "/stays/chat/$bookingId",
                      params: { bookingId: currentStay.id },
                      search: { request: "early_checkin" },
                    })
                  }
                  color="bg-emerald-50 text-emerald-700 ring-emerald-100"
                />
                <PortalAction
                  icon={LogOut}
                  label="Late checkout"
                  onClick={() =>
                    navigate({
                      to: "/stays/chat/$bookingId",
                      params: { bookingId: currentStay.id },
                      search: { request: "late_checkout" },
                    })
                  }
                  color="bg-amber-50 text-amber-700 ring-amber-100"
                />
              </div>
            </div>
          </div>
        ) : (
          <div className=" bg-white p-6 text-center shadow-sm ring-1 ring-neutral-100">
            <Home className="mx-auto h-8 w-8 text-neutral-300" />
            <p className="mt-2 text-sm text-neutral-500">No tienes ninguna estancia próxima.</p>
            <Link
              to="/stays"
              className="mt-3 inline-block  bg-[var(--brand)] px-5 py-2 text-sm font-semibold text-white"
            >
              Reservar habitación
            </Link>
          </div>
        )}
      </div>

      {/* ── Availability watches ── */}
      {activeWatches.length > 0 && (
        <Section title="Avisos de disponibilidad">
          {activeWatches.map((w) => (
            <WatchCard key={w.id} watch={w} />
          ))}
        </Section>
      )}

      {isLoading && <p className="py-10 text-center text-sm text-neutral-400">Cargando…</p>}

      {/* ── Active / upcoming ── */}
      {active.length > 0 && (
        <Section title="Próximos y activos">
          {active.map((b) => (
            <TripCard key={b.id} booking={b} />
          ))}
        </Section>
      )}

      {/* ── History ── */}
      {past.length > 0 && (
        <Section title="Historial">
          {past.map((b) => (
            <TripCard key={b.id} booking={b} />
          ))}
        </Section>
      )}

      {!isLoading && list.length === 0 && !currentStay && (
        <div className=" bg-white p-8 text-center shadow-sm ring-1 ring-neutral-100">
          <p className="text-sm text-neutral-500">Aún no tienes reservas.</p>
          <Link
            to="/stays"
            className="mt-3 inline-block  bg-[var(--brand)] px-5 py-2 text-sm font-semibold text-white"
          >
            Descubrir propiedades
          </Link>
        </div>
      )}
    </div>
  );
}

const HUB_CARD =
  "flex flex-col items-center gap-1.5 rounded-xl bg-white p-3 text-center shadow-sm ring-1 ring-neutral-100 active:scale-[0.97]";
const HUB_ICON =
  "flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--brand)]/10 text-[var(--brand)]";
const HUB_LABEL = "text-[11px] font-medium leading-tight text-neutral-700";

function PortalAction({
  icon: Icon,
  label,
  onClick,
  color,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  color: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-2  p-3 text-center text-xs font-medium ring-1 active:scale-95 ${color}`}
    >
      <Icon className="h-5 w-5" />
      {label}
    </button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-400">
        {title}
      </h2>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function TripCard({ booking }: { booking: Prebooking }) {
  const linkTo =
    booking.status === "held" ? "/stays/checkout/$bookingId" : "/stays/booking/$bookingId";
  return (
    <Link
      to={linkTo}
      params={{ bookingId: booking.id }}
      className="flex items-center gap-3  bg-white p-4 shadow-sm ring-1 ring-neutral-100 active:scale-[0.99]"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className={` border px-2 py-0.5 text-[11px] font-medium ${BOOKING_STATUS_CLASSES[booking.status]}`}
          >
            {BOOKING_STATUS_LABELS[booking.status]}
          </span>
          {booking.status === "held" && <Clock className="h-3.5 w-3.5 text-amber-500" />}
        </div>
        <h3 className="mt-1.5 truncate font-semibold text-neutral-900">{booking.roomName}</h3>
        <p className="truncate text-sm text-neutral-500">{booking.propertyName}</p>
        <p className="mt-0.5 text-xs text-neutral-400">
          {formatDateShort(booking.checkIn)} → {formatDateShort(booking.checkOut)} ·{" "}
          {eur(booking.total)}
        </p>
      </div>
      <ChevronRight className="h-5 w-5 shrink-0 text-neutral-300" />
    </Link>
  );
}

function WatchCard({ watch }: { watch: AvailabilityWatch }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const cancel = useMutation({
    mutationFn: () => pms.cancelWatch(watch.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pms", "watches"] }),
  });
  const isAvailable = watch.status === "available";

  return (
    <div
      className={`flex items-center gap-3  p-4 shadow-sm ring-1 ${
        isAvailable ? "bg-emerald-50 ring-emerald-200" : "bg-white ring-neutral-100"
      }`}
    >
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center  ${
          isAvailable ? "bg-emerald-500 text-white" : "bg-amber-100 text-amber-600"
        }`}
      >
        <BellRing className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="truncate font-semibold text-neutral-900">{watch.roomName}</h3>
        <p className="truncate text-xs text-neutral-500">
          {watch.propertyName} · {formatDateShort(watch.checkIn)} →{" "}
          {formatDateShort(watch.checkOut)}
        </p>
        <p
          className={`mt-0.5 text-xs font-medium ${isAvailable ? "text-emerald-600" : "text-amber-600"}`}
        >
          {isAvailable ? "¡Disponible ahora!" : "Te avisaremos cuando se libere"}
        </p>
      </div>
      {isAvailable ? (
        <button
          onClick={() =>
            navigate({
              to: "/stays/book/$roomId",
              params: { roomId: watch.roomId },
              search: { checkIn: watch.checkIn, checkOut: watch.checkOut, guests: watch.guests },
            })
          }
          className="shrink-0  bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white active:scale-95"
        >
          Reservar
        </button>
      ) : (
        <button
          onClick={() => cancel.mutate()}
          aria-label="Cancelar aviso"
          className="shrink-0  p-1.5 text-neutral-400 hover:bg-neutral-100"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
