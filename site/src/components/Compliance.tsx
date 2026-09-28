import { COMPLIANCE } from "../../supabase/functions/_shared/plans.ts";
import { Tick } from "./ui";

const WHEN: Record<string, string> = {
  "Registro de viajeros": "RD 933/2021",
  "Comunicación a SES.HOSPEDAJES": "Desde 2 dic 2024",
  "Facturación VeriFactu": "Desde 2027",
};

/**
 * The obligations of a Spanish accommodation as a ledger: what the product
 * does for each one and since when it is required. A "building" item would be
 * labelled as such: the site never claims compliance it does not deliver.
 */
export function ComplianceLedger({ className = "" }: { className?: string }) {
  const done = COMPLIANCE.filter((c) => c.status === "available").length;
  return (
    <div className={`surface-lift overflow-hidden rounded-2xl ${className}`}>
      <div className="flex items-center justify-between border-b bg-muted/60 px-5 py-3">
        <p className="font-figure text-xs text-stone">Libro de obligaciones</p>
        <p className="font-figure text-xs text-mineral">
          {done} de {COMPLIANCE.length} al día
        </p>
      </div>
      <ul className="divide-y">
        {COMPLIANCE.map((c, i) => (
          <li
            key={c.name}
            className="grid gap-3 px-5 py-5 sm:grid-cols-[auto_1fr_auto] sm:items-start"
            data-reveal
            style={{ ["--d" as string]: `${150 + i * 110}ms` }}
          >
            <span
              className={`flex h-8 w-8 items-center justify-center rounded-full ${c.status === "available" ? "bg-mineral-soft" : "bg-sand"}`}
            >
              {c.status === "available" ? (
                <Tick />
              ) : (
                <span className="font-figure text-[0.65rem] text-brass-deep">…</span>
              )}
            </span>
            <div>
              <p className="font-semibold">
                {c.name}
                {c.status !== "available" && (
                  <span className="font-figure ml-2 text-xs font-normal text-brass-deep">
                    en desarrollo
                  </span>
                )}
              </p>
              <p className="mt-1 text-sm leading-relaxed text-stone">{c.detail}</p>
            </div>
            <p className="font-figure text-xs whitespace-nowrap text-stone">{WHEN[c.name] ?? ""}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
