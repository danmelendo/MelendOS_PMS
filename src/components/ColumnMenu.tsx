import type { ReactNode } from "react";
import { ArrowDownWideNarrow, ArrowUpNarrowWide, MoreVertical } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";

export type SortDir = "asc" | "desc";

/**
 * Spreadsheet-style column header: the title plus a three-dot menu to sort the
 * column and filter it. The dot turns into an accent while the column is sorted
 * or filtered, so a hidden filter is never a surprise.
 */
export function ColumnMenu({
  label,
  align = "left",
  sort,
  sortLabels = ["Ascendente", "Descendente"],
  onSort,
  active,
  onClear,
  children,
}: {
  label: string;
  align?: "left" | "right";
  /** Current sort of this column (undefined = sorted by another column). */
  sort?: SortDir;
  sortLabels?: [string, string];
  onSort?: (dir: SortDir) => void;
  /** Whether the column has a filter applied. */
  active?: boolean;
  onClear?: () => void;
  children?: ReactNode;
}) {
  const marked = !!sort || !!active;
  return (
    <div className={cn("flex items-center gap-1", align === "right" && "justify-end")}>
      <span>{label}</span>
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={`Ordenar y filtrar: ${label}`}
            className={cn(
              "relative inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground",
              marked && "text-info",
            )}
          >
            <MoreVertical className="h-4 w-4" />
            {marked && (
              <span className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-info" />
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent align={align === "right" ? "end" : "start"} className="w-64 p-2 text-sm">
          {onSort && (
            <div className="space-y-0.5">
              {(["asc", "desc"] as const).map((dir, i) => {
                const Icon = dir === "asc" ? ArrowUpNarrowWide : ArrowDownWideNarrow;
                return (
                  <button
                    key={dir}
                    type="button"
                    onClick={() => onSort(dir)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted",
                      sort === dir && "bg-info/10 font-medium text-info-foreground",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {sortLabels[i]}
                  </button>
                );
              })}
            </div>
          )}
          {children && (
            <div className={cn(onSort && "mt-2 border-t pt-2")}>
              {children}
              {active && onClear && (
                <button
                  type="button"
                  onClick={onClear}
                  className="mt-2 w-full rounded-md px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted"
                >
                  {t("Quitar filtro")}
                </button>
              )}
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}

/** Checkbox list of values; nothing ticked = no filter. */
export function ValuesFilter({
  options,
  selected,
  onChange,
}: {
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <div className="max-h-64 space-y-0.5 overflow-y-auto">
      {options.map((o) => {
        const checked = selected.includes(o.value);
        const id = `vf-${o.value}`;
        return (
          <label
            key={o.value}
            htmlFor={id}
            className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 hover:bg-muted"
          >
            <Checkbox
              id={id}
              checked={checked}
              onCheckedChange={(v) =>
                onChange(v ? [...selected, o.value] : selected.filter((s) => s !== o.value))
              }
            />
            <span className="truncate">{o.label}</span>
          </label>
        );
      })}
    </div>
  );
}

/** From / to dates (yyyy-MM-dd); either can be empty. */
export function DateBoundsFilter({
  from,
  to,
  onChange,
}: {
  from: string;
  to: string;
  onChange: (next: { from: string; to: string }) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 px-1">
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">{t("Desde")}</Label>
        <Input
          type="date"
          value={from}
          max={to || undefined}
          onChange={(e) => onChange({ from: e.target.value, to })}
          className="h-8 px-2 text-xs"
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">{t("Hasta")}</Label>
        <Input
          type="date"
          value={to}
          min={from || undefined}
          onChange={(e) => onChange({ from, to: e.target.value })}
          className="h-8 px-2 text-xs"
        />
      </div>
    </div>
  );
}
