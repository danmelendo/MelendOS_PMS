import { CheckCircle2, Hammer } from "lucide-react";
import { COMPLIANCE } from "../../supabase/functions/_shared/plans.ts";

/**
 * Where the product stands on each legal obligation. What is not built yet is
 * labelled as such: the site never claims compliance it does not deliver.
 */
export function ComplianceList() {
  return (
    <ul className="grid gap-4 md:grid-cols-3">
      {COMPLIANCE.map((c) => (
        <li key={c.name} className="rounded-lg border bg-card p-5">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
              c.status === "available"
                ? "bg-secondary text-secondary-foreground"
                : "bg-gold/20 text-gold-foreground"
            }`}
          >
            {c.status === "available" ? (
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <Hammer className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {c.status === "available" ? "Disponible" : "En desarrollo"}
          </span>
          <p className="mt-3 font-semibold">{c.name}</p>
          <p className="mt-1 text-sm text-muted-foreground">{c.detail}</p>
        </li>
      ))}
    </ul>
  );
}
