import { createFileRoute, Outlet, Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Compass, Home, Sparkles, UserRound, Hotel, Ticket } from "lucide-react";
import { toast } from "sonner";
import { MemberProvider, useMember } from "@/lib/member-session";
import { useBrand } from "@/lib/brand";
import { BrandSwitcher } from "@/components/BrandSwitcher";
import { pms } from "@/integrations/pms";
import { registerServiceWorker, showNotification } from "@/lib/notifications";

export const Route = createFileRoute("/stays")({
  component: StaysLayout,
  head: () => ({
    meta: [
      { title: "Demo Stays · App del huésped" },
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
  const path = useRouterState({ select: (r) => r.location.pathname });
  const { brand } = useBrand();

  return (
    <MemberProvider>
      <WatchPoller />
      <div className="stays-root min-h-[100svh] w-full bg-[#e9edf2]">
        <div className="relative mx-auto flex min-h-[100svh] w-full max-w-md flex-col bg-[#f4f6f9] shadow-xl">
          {/* Brand bar: same app, one brand per hotel */}
          <header className="sticky top-0 z-30 flex items-center justify-between border-b border-neutral-200/70 bg-white/90 px-4 py-2 backdrop-blur">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[var(--brand)] text-white">
                <Hotel className="h-3.5 w-3.5" />
              </span>
              <span className="text-sm font-semibold tracking-tight">{brand.name}</span>
            </div>
            <BrandSwitcher />
          </header>

          <main className="flex-1 pb-24">
            <Outlet />
          </main>

          {/* Bottom tab bar */}
          <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-md border-t border-neutral-200 bg-white/95 backdrop-blur">
            <div className="grid grid-cols-5">
              {NAV.map((item) => {
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
    </MemberProvider>
  );
}
