import type { ReactNode } from "react";

/** "Melend/OS": the slash and "OS" in brass, as on the brand image. */
export function Wordmark({
  onNight = false,
  className = "",
}: {
  onNight?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`font-semibold tracking-[-0.02em] whitespace-nowrap ${onNight ? "text-navy-strong" : "text-foreground"} ${className}`}
    >
      Melend
      <span className={onNight ? "text-brass" : "text-brass-deep"}>/OS</span>
    </span>
  );
}

/**
 * Section marker: a number and a name split by the brand's slash, set like a
 * line in the reception ledger ("03 / Módulos").
 */
export function Marker({
  n,
  children,
  onNight = false,
}: {
  n: string;
  children: ReactNode;
  onNight?: boolean;
}) {
  return (
    <p
      className={`font-figure flex items-center gap-2 text-[0.8rem] ${onNight ? "text-navy-foreground/70" : "text-stone"}`}
    >
      <span className={onNight ? "text-brass" : "text-brass-deep"}>{n}</span>
      <span aria-hidden="true" className={onNight ? "text-navy-foreground/40" : "text-stone/50"}>
        /
      </span>
      <span>{children}</span>
    </p>
  );
}

/** Section heading: marker, a display title and an optional lead paragraph. */
export function SectionHead({
  n,
  label,
  title,
  lead,
  onNight = false,
  className = "",
}: {
  n: string;
  label: string;
  title: ReactNode;
  lead?: ReactNode;
  onNight?: boolean;
  className?: string;
}) {
  return (
    <div className={`max-w-2xl ${className}`} data-reveal>
      <Marker n={n} onNight={onNight}>
        {label}
      </Marker>
      <h2
        className={`font-display mt-4 text-[2.4rem] text-balance sm:text-[3.2rem] ${onNight ? "text-navy-strong" : "text-foreground"}`}
      >
        {title}
      </h2>
      {lead && (
        <p
          className={`mt-4 text-base leading-relaxed sm:text-lg ${onNight ? "text-navy-foreground/75" : "text-stone"}`}
        >
          {lead}
        </p>
      )}
    </div>
  );
}

/** Small "included / done" tick in mineral green, used for real states. */
export function Tick({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className={`h-4 w-4 shrink-0 text-mineral ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3.5 8.5l3 3 6-7" />
    </svg>
  );
}
