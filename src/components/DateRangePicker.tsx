import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ComponentProps,
} from "react";
import type { DateRange, DayButton } from "react-day-picker";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addMonths,
  differenceInCalendarDays,
  endOfMonth,
  format,
  isBefore,
  parseISO,
  startOfMonth,
} from "date-fns";
import { enGB, es } from "date-fns/locale";
import { CalendarDays } from "lucide-react";
import { Calendar, CalendarDayButton } from "@/components/ui/calendar";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { pms, type PriceCalendarNight } from "@/integrations/pms";
import { currentLocale, useLang } from "@/lib/i18n";

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

/** The nights of one month to price (from today when it is the current month). */
function monthWindow(month: Date) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const first = isBefore(startOfMonth(month), today) ? today : startOfMonth(month);
  const days = differenceInCalendarDays(endOfMonth(month), first) + 1;
  return { from: ymd(first), days };
}

const priceQuery = (pricing: PickerPricing, month: Date) => {
  const { from, days } = monthWindow(month);
  return {
    queryKey: ["price-calendar", pricing, from, days],
    staleTime: 60_000,
    queryFn: () => pms.getPriceCalendar({ ...pricing, from, days }),
  };
};

// Prices load as soon as the picker is on the page (not when it opens) and the
// next month is fetched ahead, so opening the calendar or moving forward a
// month shows the prices without waiting for the server.
function usePriceNights(pricing: PickerPricing | undefined, month: Date) {
  const enabled = !!pricing && (!!pricing.roomId || !!pricing.propertyId || !!pricing.tenantId);
  const { days } = monthWindow(month);
  const qc = useQueryClient();
  const q = useQuery({
    ...priceQuery(pricing ?? {}, month),
    enabled: enabled && days > 0,
  });
  useEffect(() => {
    if (enabled && pricing) void qc.prefetchQuery(priceQuery(pricing, addMonths(month, 1)));
  }, [enabled, pricing, month, qc]);
  return useMemo(() => {
    const byDate = new Map<string, PriceCalendarNight>();
    for (const n of q.data ?? []) byDate.set(n.date, n);
    return { enabled, loading: q.isLoading, byDate };
  }, [enabled, q.data, q.isLoading]);
}

const NBSP = String.fromCharCode(0xa0); // keeps price and € together
const euros = (n: number) => `${n.toLocaleString(currentLocale())}${NBSP}€`;

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
  onOpenChange,
}: {
  checkIn: string;
  checkOut: string;
  onChange: (value: { checkIn: string; checkOut: string }) => void;
  /** Show the average nightly price under each date. */
  pricing?: PickerPricing;
  className?: string;
  /** Told when the calendar opens or closes (the embedded widget resizes its frame). */
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpenState] = useState(false);
  const setOpen = (next: boolean) => {
    setOpenState(next);
    onOpenChange?.(next);
  };
  const [draft, setDraft] = useState<DateRange | undefined>(undefined);
  const [hover, setHover] = useState<Date | null>(null);
  const [month, setMonth] = useState<Date>(() => (checkIn ? parseISO(checkIn) : new Date()));
  const prices = usePriceNights(pricing, month);

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

  const { t, lang } = useLang();
  const dfLocale = lang === "en" ? enGB : es;
  const label =
    checkIn && checkOut
      ? `${format(parseISO(checkIn), "d MMM", { locale: dfLocale })} → ${format(parseISO(checkOut), "d MMM", { locale: dfLocale })}`
      : t("Elige tus fechas");

  const nights =
    choosingEnd && selected?.to ? differenceInCalendarDays(selected.to, selected.from!) : 0;
  const step = choosingEnd
    ? nights
      ? `${t("Salida el {date}", { date: format(selected!.to!, "d MMM", { locale: dfLocale }) })} · ${nights} ${t(nights === 1 ? "noche" : "noches")}`
      : t("Ahora elige la fecha de salida")
    : t("Elige la fecha de entrada");

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
            locale={dfLocale}
            className={pricing ? "[--cell-size:2.75rem]" : undefined}
            components={pricing ? { DayButton: PricedDay } : undefined}
          />
          {pricing && (
            <p className="px-3 pb-3 text-[11px] text-neutral-500">
              {t("Precio medio por noche · «–» completo")}
            </p>
          )}
        </PricesContext.Provider>
      </PopoverContent>
    </Popover>
  );
}
