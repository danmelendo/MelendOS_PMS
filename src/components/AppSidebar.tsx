import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Calendar,
  CalendarDays,
  ClipboardList,
  DoorOpen,
  LogOut,
  PackagePlus,
  Tag,
  Ticket,
  Users,
  BarChart3,
  Star,
  MessagesSquare,
  Wand2,
  Globe,
  BookOpenCheck,
  PlugZap,
  Boxes,
  CreditCard,
  UsersRound,
  Activity,
  Network,
  ShieldCheck,
  Receipt,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { DEMO_ACCESS, demoAccounts, demoSignIn } from "@/lib/demo-access";
import { useRoles } from "@/lib/roles";
import { useInboxLive, useUnreadCount } from "@/lib/chat";
import { useSesAttention } from "@/lib/ses";
import { useAnyHotelHas } from "@/lib/features";
import type { Feature } from "@domain/features.ts";

// `feature`: shown only if one of the staff member's hotels has the module.
type NavItem = { to: string; label: string; icon: typeof Calendar; feature?: Feature };

const items: NavItem[] = [
  { to: "/today", label: "Hoy", icon: Calendar },
  { to: "/calendar", label: "Calendario", icon: CalendarDays },
  { to: "/messages", label: "Mensajes", icon: MessagesSquare, feature: "chat" },
  { to: "/reservations", label: "Reservas", icon: ClipboardList },
  { to: "/customers", label: "Clientes", icon: Users },
  { to: "/travellers", label: "Registro de viajeros", icon: ShieldCheck },
  { to: "/invoices", label: "Facturas", icon: Receipt },
  { to: "/journal", label: "Booking journal", icon: BookOpenCheck },
  { to: "/reports", label: "Informes", icon: BarChart3, feature: "reports" },
  { to: "/reviews", label: "Reseñas", icon: Star, feature: "reviews" },
];

// Active item: gold inset bar + gold icon, on the navy sidebar.
const ACTIVE_ITEM =
  "data-[active=true]:shadow-[inset_3px_0_0_var(--sidebar-primary)] data-[active=true]:[&>a>svg]:text-sidebar-primary";

const adminItems: NavItem[] = [
  { to: "/admin/manual", label: "Reserva manual", icon: Wand2 },
  { to: "/rooms", label: "Habitaciones", icon: DoorOpen },
  { to: "/rates", label: "Tarifas", icon: Tag },
  { to: "/extras", label: "Extras", icon: PackagePlus },
  { to: "/promos", label: "Códigos promo", icon: Ticket },
  { to: "/website", label: "Web y dominio", icon: Globe },
  { to: "/payments", label: "Cobros y TPV", icon: CreditCard },
  { to: "/channels", label: "Canales", icon: Network, feature: "channels" },
  { to: "/integrations", label: "Integraciones IA", icon: PlugZap, feature: "mcp" },
  { to: "/team", label: "Equipo", icon: UsersRound },
  { to: "/activity", label: "Actividad y consumo", icon: Activity },
  { to: "/plan", label: "Plan y módulos", icon: Boxes },
];

export function AppSidebar() {
  const path = useRouterState({ select: (r) => r.location.pathname });
  const { isAdmin, isGroup, canOperate, canMessage } = useRoles();
  useInboxLive(canMessage);
  const unread = useUnreadCount(canMessage);
  const { data: sesAttention = 0 } = useSesAttention();
  const { signOut, user } = useAuth();
  const has = useAnyHotelHas();
  const visible = (i: NavItem) =>
    (!i.feature || has(i.feature)) &&
    (canOperate || i.to !== "/admin/manual") &&
    (canMessage || i.to !== "/messages");
  const navigate = useNavigate();
  const qc = useQueryClient();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex flex-col gap-1 px-2 py-1.5 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:px-0">
          {/* Collapsed: only the icon. Both variants are for the navy sidebar. */}
          <img
            src="/brand/isotipo-dark.webp"
            alt="Melend/OS"
            className="hidden h-8 w-8 shrink-0 object-contain group-data-[collapsible=icon]:block"
          />
          <div className="flex min-w-0 flex-col gap-1 leading-tight group-data-[collapsible=icon]:hidden">
            <img
              src="/brand/logo-dark.webp"
              alt="Melend/OS"
              width={583}
              height={96}
              className="h-7 w-auto self-start"
            />
            <span className="pl-0.5 text-xs text-sidebar-foreground/60">
              {isGroup && !canOperate
                ? "Dirección de grupo"
                : isAdmin
                  ? "Administrador"
                  : "Recepción"}
            </span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Operativa</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.filter(visible).map((item) => {
                const active = path === item.to || path.startsWith(item.to + "/");
                return (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton
                      asChild
                      isActive={active}
                      tooltip={item.label}
                      className={ACTIVE_ITEM}
                    >
                      <Link to={item.to} className="flex items-center gap-2">
                        <item.icon className="h-4 w-4" />
                        <span>{item.label}</span>
                        {item.to === "/travellers" && sesAttention > 0 && (
                          <span
                            className="ml-auto min-w-5 rounded-full bg-destructive px-1.5 text-center text-[11px] font-semibold text-white"
                            aria-label={`${sesAttention} comunicaciones que revisar`}
                          >
                            {sesAttention}
                          </span>
                        )}
                        {item.to === "/messages" && unread > 0 && (
                          <span
                            className="ml-auto min-w-5 rounded-full bg-sidebar-primary px-1.5 text-center text-[11px] font-semibold text-sidebar-primary-foreground"
                            aria-label={`${unread} mensajes sin leer`}
                          >
                            {unread}
                          </span>
                        )}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {isAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel>Admin</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {adminItems.filter(visible).map((item) => {
                  const active = path === item.to;
                  return (
                    <SidebarMenuItem key={item.to}>
                      <SidebarMenuButton
                        asChild
                        isActive={active}
                        tooltip={item.label}
                        className={ACTIVE_ITEM}
                      >
                        <Link to={item.to} className="flex items-center gap-2">
                          <item.icon className="h-4 w-4" />
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
                <SidebarMenuItem>
                  <SidebarMenuButton asChild tooltip="Web pública">
                    <a
                      href="/web"
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-2"
                    >
                      <Globe className="h-4 w-4" />
                      <span>Web pública</span>
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter>
        {/* Demo on the real backend: switch profile to see each hotel's data. */}
        {DEMO_ACCESS && (
          <label className="px-2 group-data-[collapsible=icon]:hidden">
            <span className="mb-1 block text-[11px] text-sidebar-foreground/60">Ver como</span>
            <select
              value={user?.email ?? ""}
              onChange={async (e) => {
                try {
                  // Signing in again replaces the session (no sign-out, which
                  // would unmount the panel halfway).
                  await demoSignIn(e.target.value);
                  qc.resetQueries();
                  navigate({ to: "/today" });
                } catch (err) {
                  toast.error((err as Error).message);
                }
              }}
              className="w-full rounded-md border border-sidebar-border bg-sidebar px-2 py-1.5 text-xs text-sidebar-foreground"
            >
              {demoAccounts("staff").map((a) => (
                <option key={a.email} value={a.email}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="px-2 pb-1 flex items-center gap-2 group-data-[collapsible=icon]:hidden">
          <Link
            to="/account"
            className="text-xs text-sidebar-foreground/60 truncate flex-1 hover:text-sidebar-foreground hover:underline"
            title="Mi cuenta"
          >
            {user?.email}
          </Link>
          {isAdmin && (
            <Badge
              variant="outline"
              className="border-sidebar-primary/50 text-[10px] text-sidebar-primary"
            >
              admin
            </Badge>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="justify-start group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
          title="Cerrar sesión"
          aria-label="Cerrar sesión"
          onClick={async () => {
            await signOut();
            navigate({ to: "/login" });
          }}
        >
          <LogOut className="mr-2 h-4 w-4 shrink-0 group-data-[collapsible=icon]:mr-0" />
          <span className="group-data-[collapsible=icon]:hidden">Cerrar sesión</span>
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
