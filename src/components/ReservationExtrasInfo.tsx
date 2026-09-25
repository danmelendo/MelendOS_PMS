// Compact list of a reservation's extras + internal notes for staff. Fed by a
// `reservation_extras(...)` embed.
export interface ReservationExtraItem {
  qty: number;
  is_gift: boolean;
  extras: { name: string; category: string } | null;
}

export function ReservationExtrasInfo({
  items,
  notes,
}: {
  items: ReservationExtraItem[] | null | undefined;
  notes?: string | null;
}) {
  const hasItems = !!items?.length;
  const note = notes?.trim();
  if (!hasItems && !note) return null;
  return (
    <div className="w-full mt-1 space-y-1">
      {note && (
        <div className="text-xs rounded border border-info/30 bg-info/10 px-2 py-1 text-info-foreground">
          <span className="font-medium">Notas internas:</span> {note}
        </div>
      )}
      {items?.map((it, i) => (
        <div key={i} className="text-xs text-muted-foreground">
          {it.is_gift ? "🎁 " : "• "}
          {it.extras?.name ?? "Extra"}
          {it.qty > 1 ? ` ×${it.qty}` : ""}
        </div>
      ))}
    </div>
  );
}
