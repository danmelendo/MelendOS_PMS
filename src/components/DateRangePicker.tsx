import { createContext, useContext, useMemo, useState, type ComponentProps } from "react";
import type { DateRange, DayButton } from "react-day-picker";
import { useQuery } from "@tanstack/react-query";
import {
  differenceInCalendarDays,
  endOfMonth,
  format,
  isBefore,
  parseISO,
  startOfMonth,
} from "date-fns";
import { es } from "date-fns/locale";
import { CalendarDays } from "lucide-react";
import { Calendar, CalendarDayButton } from "@/components/ui/calendar";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { pms, type PriceCalendarNight } from "@/integrations/pms";

// Single range date selector: pick check-in and check-out in the same calendar.
// Explicit two-step flow: the first click sets the check-in, the second the
// check-out (and only then closes). While choosing the check-out, the range
// follows the pointer, so it snakes across the weeks before the second click.
// With `pricing`, each night shows its average price in the free rooms (like
// airline fare calendars) and "–" when everything is taken.
const ymd = (d: Date) => format(d, "yyyy-MM-dd");

export interface PickerPricing {
  roomId?: string;
  propertyId?: string;
  tenantId?: string;
  guests?: number;
}

function usePriceNights(pricing: PickerPricing | undefined, month: Date) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const first = isBefore(startOfMonth(month), today) ? today : startOfMonth(month);
  const days = differenceInCalendarDays(endOfMonth(month), first) + 1;
  const enabled = !!pricing && (!!pricing.roomId || !!pricing.propertyId || !!pricing.tenantId);
  const q = useQuery({
    queryKey: ["price-calendar", pricing, ymd(first), days],
    enabled: enabled && days > 0,
    staleTime: 60_000,
    queryFn: () => pms.getPriceCalendar({ ...pricing, from: ymd(first), days }),
  });
  return useMemo(() => {
    const byDate = new Map<string, PriceCalendarNight>();
    for (const n of q.data ?? []) byDate.set(n.date, n);
    return { enabled, loading: q.isLoading, byDate };
  }, [enabled, q.data, q.isLoading]);
}

const NBSP = String.fromCharCode(0xa0); // keeps price and € together
const euros = (n: number) => `${n.toLocaleString("es-ES")}${NBSP}€`;

const PricesContext = createContext<ReturnType<typeof usePriceNights> | null>(null);

// Day cell with the night's price underneath (module scope: defining it inside
// the picker would remount every cell on each hover).
function PricedDay({ children, ...props }: ComponentProps<typeof DayButton>) {
  const prices = useContext(PricesContext);
  const d = props.day.date;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const night = prices?.byDate.get(ymd(d));
  let price: string | null = null;
  if (prices?.enabled && !props.day.outside && !isBefore(d, today)) {
    price = prices.loading ? NBSP : night?.price != null ? euros(night.price) : "–";
  }
  return (
    <CalendarDayButton {...props}>
      {children}
      {price !== null && (
        <span
          className={`text-[10px] leading-none tabular-nums ${
            night?.price == null && !prices?.loading ? "opacity-50" : ""
          }`}
        >
          {price}
        </span>
      )}
    </CalendarDayButton>
  );
}

export function DateRangePicker({
  checkIn,
  checkOut,
  onChange,
  pricing,
  className = "",
}: {
  checkIn: string;
  checkOut: string;
  onChange: (value: { checkIn: string; checkOut: string }) => void;
  /** Show the average nightly price under each date. */
  pricing?: PickerPricing;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange | undefined>(undefined);
  const [hover, setHover] = useState<Date | null>(null);
  const [month, setMonth] = useState<Date>(() => (checkIn ? parseISO(checkIn) : new Date()));
  const prices = usePriceNights(open ? pricing : undefined, month);

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
      setMonth(checkIn ? parseISO(checkIn) : today);
      setHover(null);
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
    setDraft({ from: draft.from, to: day });
    onChange({ checkIn: ymd(draft.from), checkOut: ymd(day) });
    setOpen(false);
  };

  // Choosing the check-out: preview the range up to the day under the pointer.
  const choosingEnd = !!draft?.from && !draft.to;
  const selected: DateRange | undefined =
    choosingEnd && hover && hover.getTime() > draft!.from!.getTime()
      ? { from: draft!.from, to: hover }
      : draft;

  const label =
    checkIn && checkOut
      ? `${format(parseISO(checkIn), "d MMM", { locale: es })} → ${format(parseISO(checkOut), "d MMM", { locale: es })}`
      : "Elige tus fechas";

  const nights =
    choosingEnd && selected?.to ? differenceInCalendarDays(selected.to, selected.from!) : 0;
  const step = choosingEnd
    ? nights
      ? `Salida el ${format(selected!.to!, "d MMM", { locale: es })} · ${nights} ${nights === 1 ? "noche" : "noches"}`
      : "Ahora elige la fecha de salida"
    : "Elige la fecha de entrada";

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
        <PricesContext.Provider value={prices}>
          <p className="px-3 pt-3 text-xs font-medium text-[var(--brand)]">{step}</p>
          <Calendar
            mode="range"
            selected={selected}
            // react-day-picker only honours `selected` when onSelect is set;
            // without it, it keeps its own range and extends the old one.
            onSelect={() => {}}
            onDayClick={handleDayClick}
            onDayMouseEnter={(day) => choosingEnd && setHover(day)}
            onDayMouseLeave={() => setHover(null)}
            numberOfMonths={1}
            month={month}
            onMonthChange={setMonth}
            disabled={{ before: today }}
            locale={es}
            className={pricing ? "[--cell-size:2.75rem]" : undefined}
            components={pricing ? { DayButton: PricedDay } : undefined}
          />
          {pricing && (
            <p className="px-3 pb-3 text-[11px] text-neutral-500">
              Precio medio por noche · «–» completo
            </p>
          )}
        </PricesContext.Provider>
      </PopoverContent>
    </Popover>
  );
}
