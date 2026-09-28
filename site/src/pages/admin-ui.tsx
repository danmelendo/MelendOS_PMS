import { useEffect, type ReactNode } from "react";
import { X, type LucideIcon } from "lucide-react";

// Pieces shared by the admin panel's tabs (Leads, Clientes, Facturación).

export const FIELD =
  "h-9 rounded-md border border-input bg-card px-3 text-sm shadow-sm focus-visible:outline-2 focus-visible:outline-ring";
export const BTN =
  "inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-semibold disabled:opacity-60";
export const BTN_PRIMARY = `${BTN} bg-primary text-primary-foreground hover:bg-primary/90`;
export const BTN_OUTLINE = `${BTN} border bg-background hover:bg-accent`;

export function Stat({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card p-4">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-xl font-semibold tabular-nums">{value}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
    </div>
  );
}

/** Right-hand panel over the page; Escape or a click outside closes it. */
export function Drawer({
  title,
  subtitle,
  onClose,
  wide,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  onClose: () => void;
  wide?: boolean;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-navy/40" onClick={onClose}>
      <aside
        role="dialog"
        aria-label={typeof title === "string" ? title : undefined}
        onClick={(e) => e.stopPropagation()}
        className={`flex h-full w-full flex-col overflow-y-auto bg-card shadow-xl ${wide ? "max-w-2xl" : "max-w-md"}`}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b bg-card p-5">
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold">{title}</p>
            {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded-md p-1 hover:bg-muted"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </aside>
    </div>
  );
}

export function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block text-sm font-medium ${className}`}>
      {label}
      <span className="mt-1 block">{children}</span>
    </label>
  );
}
