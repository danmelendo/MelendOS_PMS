import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { BRAND, PAGES, SALES } from "../config";
type Page = "home" | "hostels" | "compliance" | "pricing" | "demo" | "privacy" | "notfound";

/** The brand image; on navy, "Melend" turns ivory and the arch lighter. */
export function Logo({ onNavy = false }: { onNavy?: boolean }) {
  return (
    <img
      src={onNavy ? "/logo-dark.webp" : "/logo.webp"}
      alt={BRAND}
      width={583}
      height={96}
      className="block h-7 w-auto shrink-0 sm:h-8"
    />
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
      <header className="sticky top-0 z-40 border-b border-border/70 bg-ivory/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:h-16 sm:px-6 lg:px-8">
          <a href={PAGES.home} aria-label={`${BRAND}, inicio`} className="rounded-md">
            <Logo />
          </a>
          <nav className="ml-3 flex items-center gap-1 sm:ml-6" aria-label="Principal">
            {NAV.map((n) => {
              const current = n.page === page;
              return (
                <a
                  key={n.label}
                  href={n.href}
                  aria-current={current ? "page" : undefined}
                  className={`group relative rounded-md px-2.5 py-2 text-sm transition-colors sm:px-3 ${
                    current ? "text-foreground" : "text-stone hover:text-foreground"
                  } ${n.wide ? "hidden md:inline-flex" : ""}`}
                >
                  {n.label}
                  <span
                    aria-hidden="true"
                    className={`absolute right-3 -bottom-px left-3 h-px origin-left bg-brass-deep transition-transform duration-300 ease-out ${
                      current ? "scale-x-100" : "scale-x-0 group-hover:scale-x-100"
                    }`}
                  />
                </a>
              );
            })}
          </nav>
          <a
            href={PAGES.demo}
            className="btn btn-night lean ml-auto !py-2.5 text-[0.8rem] sm:!px-4"
          >
            <span className="hidden sm:inline">Pide una demo</span>
            <span className="sm:hidden">Demo</span>
            <ArrowRight aria-hidden="true" />
          </a>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="lamp relative overflow-hidden bg-navy text-navy-foreground [--lamp-x:15%] [--lamp-y:0%]">
        <div className="mx-auto max-w-7xl px-4 pt-16 pb-10 sm:px-6 lg:px-8">
          <div className="grid gap-12 md:grid-cols-[1.6fr_1fr_1fr]">
            <div>
              <Logo onNavy />
              <p className="font-display mt-6 max-w-md text-[2rem] leading-tight text-navy-strong">
                El sistema operativo para hoteles independientes.
              </p>
              <p className="mt-4 max-w-sm text-sm text-navy-foreground/65">
                PMS, reserva directa, normativa, atención al huésped e inteligencia artificial.
                Precios sin IVA.
              </p>
            </div>
            <FooterLinks
              title="Producto"
              links={[
                [PAGES.home, "Qué incluye"],
                [PAGES.pricing, "Precios y SLA"],
                [PAGES.hostels, "Para hostales"],
                [PAGES.compliance, "SES.HOSPEDAJES y VeriFactu"],
                [PAGES.demo, "Agendar una demo"],
              ]}
            />
            <FooterLinks
              title="Contacto"
              links={[
                ...(SALES.email
                  ? [[`mailto:${SALES.email}`, SALES.email] as [string, string]]
                  : []),
                [PAGES.privacy, "Privacidad"],
              ]}
            />
          </div>
          <div className="mt-14 flex flex-wrap items-center justify-between gap-3 border-t border-navy-border pt-6 text-xs text-navy-foreground/45">
            <p>
              © {new Date().getFullYear()} {BRAND}
            </p>
            <p className="font-figure">Reserva · Estancia · Normativa · Datos</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FooterLinks({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div className="text-sm">
      <p className="font-figure text-xs text-navy-foreground/50">{title}</p>
      <ul className="mt-4 space-y-2.5">
        {links.map(([href, label]) => (
          <li key={href}>
            <a href={href} className="link-draw text-navy-foreground/80 hover:text-navy-strong">
              {label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
