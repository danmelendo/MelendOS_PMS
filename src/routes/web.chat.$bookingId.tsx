import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { pms } from "@/integrations/pms";
import { guestToken } from "@/integrations/pms/demo-stays-connector";
import { StayChat } from "@/components/StayChat";
import { GuestBookingMissing } from "@/components/GuestBookingMissing";
import { chatOpen } from "@/lib/chat";

export const Route = createFileRoute("/web/chat/$bookingId")({
  component: WebChatPage,
});

function WebChatPage() {
  const { bookingId } = Route.useParams();
  const { data: booking, isPending } = useQuery({
    queryKey: ["pms", "booking", bookingId],
    queryFn: () => pms.getBooking(bookingId),
  });
  if (!booking) return <GuestBookingMissing loading={isPending} />;

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:px-5">
      <div className="flex items-center gap-3">
        <Link
          to="/web/booking/$bookingId"
          params={{ bookingId }}
          aria-label="Volver a la reserva"
          className="text-neutral-500"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold">Recepción · {booking.propertyName}</h1>
          <p className="truncate text-sm text-neutral-500">
            {booking.roomName} · Ref. {booking.reference}
          </p>
        </div>
      </div>
      <div className="mt-4 bg-[#f4f6f9] ring-1 ring-neutral-200">
        <StayChat
          reservationId={bookingId}
          token={guestToken(bookingId)}
          open={chatOpen(booking.status, booking.checkOut)}
        />
      </div>
    </div>
  );
}
