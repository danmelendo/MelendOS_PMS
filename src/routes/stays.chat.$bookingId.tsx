import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { pms } from "@/integrations/pms";
import { guestToken } from "@/integrations/pms/demo-stays-connector";
import { StayChat } from "@/components/StayChat";
import { chatOpen } from "@/lib/chat";

export const Route = createFileRoute("/stays/chat/$bookingId")({
  validateSearch: (s: Record<string, unknown>): { request?: string } =>
    typeof s.request === "string" ? { request: s.request } : {},
  component: StaysChatScreen,
});

function StaysChatScreen() {
  const { bookingId } = Route.useParams();
  const { request } = Route.useSearch();
  const { data: booking } = useQuery({
    queryKey: ["pms", "booking", bookingId],
    queryFn: () => pms.getBooking(bookingId),
  });

  return (
    <div>
      <div className="sticky top-[41px] z-20 flex items-center gap-3 border-b border-neutral-200 bg-white px-4 py-3">
        <Link
          to="/stays/booking/$bookingId"
          params={{ bookingId }}
          aria-label="Volver a la reserva"
          className="text-neutral-500"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="min-w-0">
          <p className="truncate font-semibold">Recepción · {booking?.propertyName ?? "…"}</p>
          <p className="truncate text-xs text-neutral-500">
            {booking ? `${booking.roomName} · Ref. ${booking.reference}` : ""}
          </p>
        </div>
      </div>
      <StayChat
        reservationId={bookingId}
        token={guestToken(bookingId)}
        open={booking ? chatOpen(booking.status, booking.checkOut) : false}
        initialRequest={request}
      />
    </div>
  );
}
