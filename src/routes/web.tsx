import { createFileRoute, Outlet, Link, redirect, useRouterState } from "@tanstack/react-router";
import { Hotel, ArrowUpRight, UserRound } from "lucide-react";
import { useBrand } from "@/lib/brand";
import { BrandSwitcher } from "@/components/BrandSwitcher";
import { AgentChat } from "@/components/AgentChat";
import { adoptGuestToken } from "@/integrations/pms/demo-stays-connector";

const GUEST_LINK = /^\/web\/(?:booking|checkout|sign|upload|chat)\/([^/]+)\/?$/;

// Public hotel website. One codebase serves both hotel brands; the active one
// drives the name, accent and copy via the brand layer (src/lib/brand). Public:
// no guest identity needed to browse and book.
export const Route = createFileRoute("/web")({
  // Links sent to a guest carry their booking token (?t=...): keep it in this
  // browser and drop it from the address bar before the page loads.
  beforeLoad: ({ location }) => {
    const { t, ...rest } = location.search as Record<string, unknown>;
    const id = GUEST_LINK.exec(location.pathname)?.[1];
    if (typeof t !== "string" || !id) return;
    adoptGuestToken(id, t);
    const query = new URLSearchParams(
      Object.entries(rest).map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)]),
    ).toString();
    throw redirect({ href: location.pathname + (query ? `?${query}` : ""), replace: true });
  },
  component: WebLayout,
  head: () => ({
    meta: [
      { title: "Reserva directa · Melend/OS" },
      {
        name: "description",
        content:
          "Web de reserva directa del hotel: habitaciones, precios por noche, experiencias y check-in online.",
      },
    ],
  }),
});

const NAV = [
  { to: "/web", label: "Inicio", exact: true },
  { to: "/web/hotels", label: "Habitaciones", exact: false },
  { to: "/web/events", label: "Experiencias", exact: false },
] as const;

function WebLayout() {
  const path = useRouterState({ select: (r) => r.location.pathname });
  const { brand, ready } = useBrand();

  // Until the hotel is known (domain lookup), nothing of another hotel shows.
  if (!ready) return <div className="min-h-screen bg-white" />;
  return (
    <div className="min-h-[100svh] bg-[#f4f6f9] text-neutral-900">
      {/* Top bar — single row on tablet/desktop, two rows on phones so nothing
          overflows. The nav drops to a scrollable second row on small screens. */}
      <header className="sticky top-0 z-40 border-b border-neutral-200 bg-white/85 backdrop-blur print:hidden">
        <div className="mx-auto max-w-6xl px-4 sm:px-5">
          <div className="flex h-14 items-center gap-2 sm:h-16 sm:gap-4">
            <Link to="/web" className="flex min-w-0 items-center gap-2">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center bg-[var(--brand)] text-white">
                <Hotel className="h-4 w-4" />
              </span>
              <span className="truncate text-base font-semibold tracking-tight sm:text-lg">
                {brand.name}
              </span>
            </Link>
            {/* Inline nav from desktop up; phones + tablets use the row below */}
            <nav className="no-scrollbar ml-2 hidden min-w-0 items-center gap-1 overflow-x-auto lg:flex">
              {NAV.map((item) => {
                const active = item.exact ? path === item.to : path.startsWith(item.to);
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={`shrink-0 px-3 py-1.5 text-sm font-medium transition ${
                      active ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-100"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
            <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
              <BrandSwitcher />
              <Link
                to="/web/mi-reserva"
                aria-label="Mi reserva"
                className="inline-flex shrink-0 items-center gap-1 bg-[var(--brand)] px-2.5 py-2 text-sm font-semibold text-white sm:px-4"
              >
                <span className="hidden sm:inline">Mi reserva</span>
                <UserRound className="h-4 w-4 sm:hidden" />
              </Link>
            </div>
          </div>
          {/* Scrollable nav row on phones + tablets */}
          <nav className="no-scrollbar -mx-4 flex items-center gap-1 overflow-x-auto px-4 pb-2 lg:hidden">
            {NAV.map((item) => {
              const active = item.exact ? path === item.to : path.startsWith(item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`shrink-0 px-3 py-1.5 text-sm font-medium transition ${
                    active ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-100"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      <main>
        <Outlet />
      </main>

      <AgentChat />

      <footer className="mt-16 border-t border-neutral-200 bg-white print:hidden">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-5 py-8 text-sm text-neutral-500 sm:flex-row">
          <p>
            © {new Date().getFullYear()} {brand.name} · Demo de Melend/OS
          </p>
          <div className="flex items-center gap-4">
            <a href="/stays" className="hover:text-neutral-900">
              App del huésped
            </a>
            <a href="/today" className="hover:text-neutral-900">
              Panel de gestión
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
