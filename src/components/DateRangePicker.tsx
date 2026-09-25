import { useState } from "react";
import type { DateRange } from "react-day-picker";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { CalendarDays } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";

// Single range date selector: pick check-in and check-out in the same calendar.
// Selection is an explicit two-step flow — the first click sets the check-in, the
// second sets the check-out (and only then closes). We drive the range ourselves
// instead of letting react-day-picker complete an already-full range on the very
// first click (which closed the popover after one tap).
const ymd = (d: Date) => format(d, "yyyy-MM-dd");

export function DateRangePicker({
  checkIn,
  checkOut,
  onChange,
  className = "",
}: {
  checkIn: string;
  checkOut: string;
  onChange: (value: { checkIn: string; checkOut: string }) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange | undefined>(undefined);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Seed the in-progress range from the committed value each time we open.
  const handleOpenChange = (next: boolean) => {
    if (next) {
      setDraft(
        checkIn
          ? { from: parseISO(checkIn), to: checkOut ? parseISO(checkOut) : undefined }
          : undefined,
      );
    }
    setOpen(next);
  };

  const handleDayClick = (day: Date) => {
    // No start yet, or a complete range already chosen → begin a new range.
    if (!draft?.from || draft.to) {
      setDraft({ from: day, to: undefined });
      return;
    }
    // A start exists: clicking it again or earlier just moves the start.
    if (day.getTime() <= draft.from.getTime()) {
      setDraft({ from: day, to: undefined });
      return;
    }
    // Second valid click → complete the range, commit and close.
    const range: DateRange = { from: draft.from, to: day };
    setDraft(range);
    onChange({ checkIn: ymd(draft.from), checkOut: ymd(day) });
    setOpen(false);
  };

  const label =
    checkIn && checkOut
      ? `${format(parseISO(checkIn), "d MMM", { locale: es })} → ${format(parseISO(checkOut), "d MMM", { locale: es })}`
      : "Elige tus fechas";

  const step =
    draft?.from && !draft.to ? "Ahora elige la fecha de salida" : "Elige la fecha de entrada";

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`flex w-full items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2.5 text-left text-sm ${className}`}
        >
          <CalendarDays className="h-4 w-4 shrink-0 text-[var(--brand)]" />
          <span
            className={checkIn && checkOut ? "font-medium text-neutral-800" : "text-neutral-400"}
          >
            {label}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <p className="px-3 pt-3 text-xs font-medium text-[var(--brand)]">{step}</p>
        <Calendar
          mode="range"
          selected={draft}
          onDayClick={handleDayClick}
          numberOfMonths={1}
          defaultMonth={draft?.from ?? today}
          disabled={{ before: today }}
          locale={es}
        />
      </PopoverContent>
    </Popover>
  );
}
