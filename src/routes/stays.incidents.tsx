import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, MessagesSquare } from "lucide-react";
import { pms } from "@/integrations/pms";
import { useMember } from "@/lib/member-session";
import { chatOpen } from "@/lib/chat";
import { formatDateShort } from "@/lib/stays";

// Requests go through the chat with reception of each stay (no forms).
export const Route = createFileRoute("/stays/incidents")({
  component: RequestsScreen,
});

function RequestsScreen() {
  const { memberId } = useMember();
  const { data: bookings, isPending } = useQuery({
    queryKey: ["pms", "bookings", memberId],
    queryFn: () => pms.listBookings(memberId),
  });
  const open = (bookings ?? []).filter((b) => chatOpen(b.status, b.checkOut));

  return (
    <div className="px-5 pt-6">
      <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
        <MessagesSquare className="h-6 w-6 text-[var(--brand)]" /> Peticiones
      </h1>
      <p className="mt-1 text-sm text-neutral-500">
        Pide lo que necesites por chat a recepción: toallas, limpieza, room service, tu coche o un
        late checkout. Te responden en la misma conversación.
      </p>

      <div className="mt-5 space-y-2">
        {isPending && <p className="text-sm text-neutral-400">Cargando…</p>}
        {open.map((b) => (
          <Link
            key={b.id}
            to="/stays/chat/$bookingId"
            params={{ bookingId: b.id }}
            className="flex items-center justify-between gap-3 bg-white p-4 shadow-sm ring-1 ring-neutral-100"
          >
            <div className="min-w-0">
              <p className="truncate font-semibold">{b.propertyName}</p>
              <p className="truncate text-sm text-neutral-500">
                {b.roomName} · {formatDateShort(b.checkIn)} → {formatDateShort(b.checkOut)}
              </p>
            </div>
            <span className="flex shrink-0 items-center gap-1 text-sm font-medium text-[var(--brand)]">
              Abrir chat <ChevronRight className="h-4 w-4" />
            </span>
          </Link>
        ))}
        {!isPending && open.length === 0 && (
          <p className="bg-white p-4 text-sm text-neutral-500 shadow-sm ring-1 ring-neutral-100">
            El chat con recepción se abre cuando tienes una reserva activa.
          </p>
        )}
      </div>
    </div>
  );
}
