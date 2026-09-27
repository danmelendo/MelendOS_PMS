import type { ReactNode } from "react";
import { CalendarCheck, Hotel } from "lucide-react";
import { BRAND, PAGES, SALES } from "../config";

type Page = "home" | "hostels" | "compliance" | "pricing" | "demo" | "privacy" | "notfound";

export function Logo({ onNavy = false }: { onNavy?: boolean }) {
  return (
    <span className="flex items-center gap-2">
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${
          onNavy ? "bg-navy-gold text-navy-gold-foreground" : "bg-navy text-navy-gold"
        }`}
      >
        <Hotel className="h-4 w-4" aria-hidden="true" />
      </span>
      <span
        className={`text-base font-semibold tracking-tight whitespace-nowrap ${onNavy ? "text-navy-strong" : "text-foreground"}`}
      >
        {BRAND}
      </span>
    </span>
  );
}

// `wide`: only from tablets up (on phones the logo already goes home).
const NAV: { page: Page; href: string; label: string; wide?: boolean }[] = [
  { page: "home", href: PAGES.home, label: "Producto", wide: true },
  { page: "hostels", href: PAGES.hostels, label: "Hostales", wide: true },
  { page: "compliance", href: PAGES.compliance, label: "Normativa", wide: true },
  { page: "pricing", href: PAGES.pricing, label: "Precios" },
];

export function Layout({ page, children }: { page: Page; children: ReactNode }) {
  return (
    <div className="flex min-h-[100svh] flex-col">
      <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:h-16 sm:px-6">
          <a href={PAGES.home} aria-label={`${BRAND}, inicio`}>
            <Logo />
          </a>
          <nav className="ml-2 flex items-center gap-1 sm:ml-4" aria-label="Principal">
            {NAV.map((n) => (
              <a
                key={n.label}
                href={n.href}
                aria-current={n.page === page ? "page" : undefined}
                className={`rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors sm:px-3 ${
                  n.page === page
                    ? "bg-secondary text-secondary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                } ${n.wide ? "hidden md:inline-flex" : ""}`}
              >
                {n.label}
              </a>
            ))}
          </nav>
          <a
            href={PAGES.demo}
            className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow hover:bg-primary/90"
          >
            <CalendarCheck className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Pide una demo</span>
            <span className="sm:hidden">Demo</span>
          </a>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="bg-navy text-navy-foreground">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-[1.5fr_1fr_1fr]">
          <div className="space-y-3">
            <Logo onNavy />
            <p className="max-w-sm text-sm text-navy-foreground/70">
              Software de gestión para hostales y hoteles independientes: PMS, reserva directa,
              normativa, atención al huésped e inteligencia artificial. Precios sin IVA.
            </p>
          </div>
          <div className="space-y-2 text-sm">
            <p className="font-semibold text-navy-strong">Producto</p>
            <a href={PAGES.home} className="block text-navy-foreground/70 hover:text-navy-gold">
              Qué incluye
            </a>
            <a href={PAGES.pricing} className="block text-navy-foreground/70 hover:text-navy-gold">
              Precios y SLA
            </a>
            <a href={PAGES.hostels} className="block text-navy-foreground/70 hover:text-navy-gold">
              Para hostales
            </a>
            <a
              href={PAGES.compliance}
              className="block text-navy-foreground/70 hover:text-navy-gold"
            >
              SES.HOSPEDAJES y VeriFactu
            </a>
            <a href={PAGES.demo} className="block text-navy-foreground/70 hover:text-navy-gold">
              Agendar una demo
            </a>
          </div>
          <div className="space-y-2 text-sm">
            <p className="font-semibold text-navy-strong">Contacto</p>
            {SALES.email && (
              <a
                href={`mailto:${SALES.email}`}
                className="block text-navy-foreground/70 hover:text-navy-gold"
              >
                {SALES.email}
              </a>
            )}
            <a href={PAGES.privacy} className="block text-navy-foreground/70 hover:text-navy-gold">
              Privacidad
            </a>
          </div>
        </div>
        <div className="border-t border-navy-border">
          <p className="mx-auto max-w-6xl px-4 py-4 text-xs text-navy-foreground/50 sm:px-6">
            © {new Date().getFullYear()} {BRAND}
          </p>
        </div>
      </footer>
    </div>
  );
}
