import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { eur } from "@/lib/data";
import { t, currentLocale } from "@/lib/i18n";

interface Notif {
  id: string;
  title: string;
  detail: string;
  source: "public" | "admin" | "reception" | "system";
  at: Date;
  read: boolean;
}

const SOURCE_COLOR: Record<Notif["source"], string> = {
  public: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  admin: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
  reception: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30",
  system: "bg-muted text-muted-foreground border-border",
};

// Tiny inline beep using WebAudio so we don't need an asset
function playBeep() {
  try {
    const ctx = new (
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    )();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = 880;
    g.gain.value = 0.0001;
    o.connect(g);
    g.connect(ctx.destination);
    const now = ctx.currentTime;
    g.gain.exponentialRampToValueAtTime(0.2, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
    o.start(now);
    o.stop(now + 0.4);
    setTimeout(() => ctx.close().catch(() => {}), 600);
  } catch {
    /* ignore */
  }
}

export function NotificationBell() {
  const [items, setItems] = useState<Notif[]>([]);
  const [open, setOpen] = useState(false);
  const startedAt = useRef<number>(Date.now());

  const unread = items.filter((i) => !i.read).length;

  useEffect(() => {
    const channel = supabase
      .channel("notif-reservations")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "reservations" },
        async (payload) => {
          const r = payload.new as {
            id: string;
            room_id: string;
            start_at: string;
            total: number;
            created_by_role: string | null;
            customer_id: string | null;
          };
          // Skip events that are older than mount time (initial backfill safety)
          const created = new Date(payload.commit_timestamp ?? r.start_at).getTime();
          if (created < startedAt.current - 60_000) return;

          const { data: room } = await supabase
            .from("rooms")
            .select("name,building")
            .eq("id", r.room_id)
            .maybeSingle();
          let customerName = "—";
          if (r.customer_id) {
            const { data: c } = await supabase
              .from("customers")
              .select("name")
              .eq("id", r.customer_id)
              .maybeSingle();
            if (c?.name) customerName = c.name;
          }
          const source = (r.created_by_role as Notif["source"]) ?? "system";
          const sourceLabel =
            source === "public"
              ? "Web pública"
              : source === "admin"
                ? "Admin"
                : source === "reception"
                  ? "Recepción"
                  : "Sistema";
          const start = new Date(r.start_at);
          const notif: Notif = {
            id: r.id,
            title: `Nueva reserva · ${sourceLabel}`,
            detail: `${room?.building ?? ""} · ${room?.name ?? ""} · ${start.toLocaleString(currentLocale(), { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })} · ${customerName} · ${eur(Number(r.total))}`,
            source,
            at: new Date(),
            read: false,
          };
          setItems((prev) => [notif, ...prev].slice(0, 50));
          playBeep();
          toast.success(notif.title, { description: notif.detail });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  const markAllRead = () => setItems((prev) => prev.map((i) => ({ ...i, read: true })));

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) markAllRead();
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={t("Notificaciones")}>
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
              {unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="border-b px-3 py-2 flex items-center justify-between">
          <span className="text-sm font-semibold">{t("Notificaciones")}</span>
          {items.length > 0 && (
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setItems([])}>
              {t("Limpiar")}
            </Button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {items.length === 0 && (
            <div className="p-6 text-center text-sm text-muted-foreground">
              {t("Sin notificaciones")}
            </div>
          )}
          {items.map((n) => (
            <div key={n.id} className="border-b last:border-0 p-3 text-sm space-y-1">
              <div className="flex items-center justify-between gap-2">
                <div className="font-medium">{n.title}</div>
                <Badge variant="outline" className={SOURCE_COLOR[n.source]}>
                  {n.source}
                </Badge>
              </div>
              <div className="text-xs text-muted-foreground">{n.detail}</div>
              <div className="text-[10px] text-muted-foreground/70">
                {n.at.toLocaleTimeString(currentLocale())}
              </div>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
