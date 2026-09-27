import { createFileRoute, Outlet, Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, Compass, Home, Sparkles, UserRound, Hotel, Ticket } from "lucide-react";
import { toast } from "sonner";
import { MemberProvider, useMember } from "@/lib/member-session";
import { useBrand } from "@/lib/brand";
import { BrandSwitcher } from "@/components/BrandSwitcher";
import { GuestSignIn } from "@/components/GuestSignIn";
import { useFeatures, useHotelWebsite } from "@/lib/features";
import { pms } from "@/integrations/pms";
import { registerServiceWorker, showNotification } from "@/lib/notifications";

export const Route = createFileRoute("/stays")({
  component: StaysLayout,
  head: () => ({
    meta: [
      { title: "App del huésped · Melend/OS" },
      {
        name: "description",
        content:
          "App del huésped: reservas, check-in online, peticiones durante la estancia y club de fidelización. Se integra con cualquier PMS.",
      },
      { name: "viewport", content: "width=device-width, initial-scale=1, maximum-scale=1" },
    ],
  }),
});

// Registers the service worker and polls the PMS for watched rooms that have
// freed up, firing an OS notification + in-app toast for each. A real PMS would
// push this (Web Push + VAPID); here we re-check availability on an interval.
function WatchPoller() {
  const { memberId } = useMember();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const polling = useRef(false);

  useEffect(() => {
    registerServiceWorker();
  }, []);

  useEffect(() => {
    if (!memberId) return;
    let active = true;

    const poll = async () => {
      if (polling.current) return;
      polling.current = true;
      try {
        const freed = await pms.pollWatches(memberId);
        if (!active || freed.length === 0) return;
        qc.invalidateQueries({ queryKey: ["pms"] });
        for (const w of freed) {
          showNotification("¡Se ha liberado tu habitación! 🎉", {
            body: `${w.roomName} · ${w.propertyName} ya está disponible para tus fechas. Resérvala antes de que vuele.`,
            tag: w.id,
            data: { url: "/stays/trips" },
          });
          toast.success(`${w.roomName} disponible`, {
            description: `${w.propertyName} se ha liberado para tus fechas.`,
            action: {
              label: "Reservar",
              onClick: () =>
                navigate({
                  to: "/stays/book/$roomId",
                  params: { roomId: w.roomId },
                  search: { checkIn: w.checkIn, checkOut: w.checkOut, guests: w.guests },
                }),
            },
            duration: 12_000,
          });
        }
      } finally {
        polling.current = false;
      }
    };

    poll();
    const t = setInterval(poll, 12_000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, [memberId, qc, navigate]);

  return null;
}

const NAV = [
  { to: "/stays", label: "Descubre", icon: Compass, exact: true },
  { to: "/stays/experiences", label: "Experiencias", icon: Ticket, exact: false },
  { to: "/stays/trips", label: "Mi estancia", icon: Home, exact: false },
  { to: "/stays/loyalty", label: "Club", icon: Sparkles, exact: false },
  { to: "/stays/account", label: "Cuenta", icon: UserRound, exact: false },
] as const;

function StaysLayout() {
  return (
    <MemberProvider>
      <StaysShell />
    </MemberProvider>
  );
}

function StaysShell() {
  const path = useRouterState({ select: (r) => r.location.pathname });
  const { brand, ready } = useBrand();
  const website = useHotelWebsite();
  const { needsSignIn, memberId } = useMember();
  const features = useFeatures();
  // The club tab only for hotels with a loyalty club (chains, large hotels).
  const nav = NAV.filter(
    (item) =>
      (item.to !== "/stays/loyalty" || features.loyalty) &&
      (item.to !== "/stays/experiences" || features.experiences),
  );

  if (!ready) return <div className="min-h-[100svh] bg-[#e9edf2]" />;
  return (
    <>
      <WatchPoller />
      <div className="stays-root min-h-[100svh] w-full bg-[#e9edf2]">
        <div className="relative mx-auto flex min-h-[100svh] w-full max-w-md flex-col bg-[#f4f6f9] shadow-xl">
          {/* Brand bar: same app, one brand per hotel */}
          <header className="sticky top-0 z-30 flex items-center justify-between border-b border-neutral-200/70 bg-white/90 px-4 py-2 backdrop-blur">
            {/* Always a way back to the hotel website (its own site, or the demo web) */}
            <a
              href={website.href}
              className="-ml-1 flex min-w-0 items-center gap-1.5 py-1 pr-2"
              aria-label={`Volver a la web de ${brand.name}`}
            >
              <ChevronLeft className="h-4 w-4 shrink-0 text-neutral-400" />
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[var(--brand)] text-white">
                <Hotel className="h-3.5 w-3.5" />
              </span>
              <span className="truncate text-sm font-semibold tracking-tight">{brand.name}</span>
            </a>
            <BrandSwitcher />
          </header>

          <main className="flex-1 pb-24">
            {needsSignIn ? (
              <GuestSignIn />
            ) : memberId ? (
              <Outlet />
            ) : (
              <p className="py-20 text-center text-sm text-neutral-400">Cargando…</p>
            )}
          </main>

          {/* Bottom tab bar (every tab needs an account, so hidden until signed in) */}
          <nav
            hidden={needsSignIn}
            className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-md border-t border-neutral-200 bg-white/95 backdrop-blur"
          >
            <div
              className="grid"
              style={{ gridTemplateColumns: `repeat(${nav.length}, minmax(0, 1fr))` }}
            >
              {nav.map((item) => {
                const active = item.exact ? path === item.to : path.startsWith(item.to);
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={`flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors ${
                      active ? "text-[var(--brand)]" : "text-neutral-400"
                    }`}
                  >
                    <item.icon className="h-5 w-5" strokeWidth={active ? 2.4 : 1.8} />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </nav>
        </div>
      </div>
    </>
  );
}
