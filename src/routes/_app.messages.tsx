import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Bot, MessagesSquare, Receipt, SendHorizonal } from "lucide-react";
import { FolioDrawer } from "@/components/FolioDrawer";
import { toast } from "sonner";
import { bookingReference } from "@domain/reference.ts";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { STATUS_COLORS, STATUS_LABELS } from "@/lib/data";
import {
  CATEGORY_LABELS,
  useInbox,
  useMarkRead,
  useStaffReply,
  type InboxMessage,
} from "@/lib/chat";
import { useRoles } from "@/lib/roles";
import { t, currentLocale } from "@/lib/i18n";

export const Route = createFileRoute("/_app/messages")({
  component: MessagesPage,
});

const when = (iso: string) => {
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  return today
    ? d.toLocaleTimeString(currentLocale(), { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString(currentLocale(), { day: "numeric", month: "short" });
};

type Stay = {
  id: string;
  start_at: string;
  end_at: string;
  status: string;
  rooms: { name: string; building: string } | null;
  customers: { name: string | null } | null;
  members?: { name: string } | null;
};

// Reception inbox: one conversation per booking, unread first.
function MessagesPage() {
  const { canMessage, loading } = useRoles();
  const { data: inbox } = useInbox();
  const [selected, setSelected] = useState<string | null>(null);

  const threads = useMemo(() => {
    const byStay = new Map<string, { last: InboxMessage; unread: number; tenantId: string }>();
    for (const m of inbox ?? []) {
      const t = byStay.get(m.reservation_id);
      const unread = m.sender === "guest" && !m.read_at ? 1 : 0;
      if (!t) byStay.set(m.reservation_id, { last: m, unread, tenantId: m.tenant_id });
      else t.unread += unread;
    }
    return [...byStay].map(([id, t]) => ({ id, ...t }));
  }, [inbox]);

  const ids = threads.map((t) => t.id);
  const { data: stays } = useQuery({
    queryKey: ["chat", "stays", ids.join(",")],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reservations")
        .select(
          "id, start_at, end_at, status, rooms(name,building), customers(name), members(name)",
        )
        .in("id", ids);
      if (error) throw error;
      return (data ?? []) as unknown as Stay[];
    },
  });
  const stay = (id: string) => stays?.find((s) => s.id === id);
  const guest = (s?: Stay) => s?.customers?.name ?? s?.members?.name ?? "Huésped";

  const current = threads.find((t) => t.id === selected);

  if (loading) return null;
  if (!canMessage) return <Navigate to="/today" />;
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("Mensajes")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("Peticiones y conversaciones de los huéspedes, una por reserva.")}
        </p>
      </div>

      <Card className="grid min-h-[70vh] overflow-hidden md:grid-cols-[20rem_1fr]">
        {/* Conversations */}
        <div className={`border-r ${selected ? "hidden md:block" : ""}`}>
          {threads.length === 0 && (
            <p className="p-6 text-center text-sm text-muted-foreground">
              {t("No hay conversaciones.")}
            </p>
          )}
          <ul className="max-h-[70vh] divide-y overflow-y-auto">
            {threads.map((thread) => {
              const s = stay(thread.id);
              return (
                <li key={thread.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(thread.id)}
                    className={`w-full px-4 py-3 text-left transition-colors hover:bg-muted/50 ${
                      selected === thread.id ? "bg-info/10" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium">{guest(s)}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {when(thread.last.created_at)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs text-muted-foreground">
                        {s?.rooms ? `${s.rooms.name} · ${s.rooms.building}` : "…"} ·{" "}
                        {bookingReference(thread.id)}
                      </span>
                      {thread.unread > 0 && (
                        <span className="shrink-0 rounded-full bg-gold px-1.5 text-[11px] font-semibold text-gold-foreground">
                          {thread.unread}
                        </span>
                      )}
                    </div>
                    <p
                      className={`mt-0.5 truncate text-sm ${thread.unread ? "font-medium" : "text-muted-foreground"}`}
                    >
                      {thread.last.sender === "staff" ? t("Tú: ") : ""}
                      {thread.last.body}
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Thread */}
        <div className={`flex min-w-0 flex-col ${selected ? "" : "hidden md:flex"}`}>
          {current ? (
            <Thread
              key={current.id}
              reservationId={current.id}
              tenantId={current.tenantId}
              stay={stay(current.id)}
              guestName={guest(stay(current.id))}
              onBack={() => setSelected(null)}
            />
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
              <MessagesSquare className="h-8 w-8" />

              {t("Elige una conversación")}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

function Thread({
  reservationId,
  tenantId,
  stay,
  guestName,
  onBack,
}: {
  reservationId: string;
  tenantId: string;
  stay?: Stay;
  guestName: string;
  onBack: () => void;
}) {
  const { canOperate } = useRoles();
  const [text, setText] = useState("");
  const [folio, setFolio] = useState(false);
  const reply = useStaffReply();
  const markRead = useMarkRead();
  const end = useRef<HTMLDivElement>(null);

  const { data: messages } = useQuery({
    queryKey: ["chat", "thread", reservationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stay_messages")
        .select("id, tenant_id, reservation_id, sender, body, category, created_at, read_at")
        .eq("reservation_id", reservationId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as InboxMessage[];
    },
    refetchInterval: 5_000,
  });

  const unread = (messages ?? []).some((m) => m.sender === "guest" && !m.read_at);
  useEffect(() => {
    if (unread) markRead.mutate(reservationId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mark once per new unread batch
  }, [unread, reservationId]);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [messages?.length]);

  const send = () => {
    if (!text.trim()) return;
    reply.mutate(
      { tenantId, reservationId, body: text.trim() },
      { onSuccess: () => setText(""), onError: (e: Error) => toast.error(t(e.message)) },
    );
  };

  return (
    <>
      <div className="flex items-center gap-3 border-b px-4 py-3">
        <button type="button" onClick={onBack} className="md:hidden" aria-label={t("Volver")}>
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{guestName}</p>
          <p className="truncate text-xs text-muted-foreground">
            {stay?.rooms ? `${stay.rooms.name} · ${stay.rooms.building} · ` : ""}
            {stay
              ? `${new Date(stay.start_at).toLocaleDateString(currentLocale(), { day: "numeric", month: "short" })} → ${new Date(stay.end_at).toLocaleDateString(currentLocale(), { day: "numeric", month: "short" })}`
              : ""}{" "}
            {t("· Ref.")} {bookingReference(reservationId)}
          </p>
        </div>
        {stay && (
          <Badge variant="outline" className={STATUS_COLORS[stay.status]}>
            {t(STATUS_LABELS[stay.status])}
          </Badge>
        )}
        {stay && stay.status !== "pending" && (
          <Button size="sm" variant="outline" onClick={() => setFolio(true)}>
            <Receipt className="mr-1 h-3.5 w-3.5" /> {t("Cuenta")}
          </Button>
        )}
      </div>
      <FolioDrawer reservationId={folio ? reservationId : null} onOpenChange={setFolio} />

      <div className="max-h-[55vh] flex-1 space-y-2 overflow-y-auto bg-muted/20 p-4">
        {messages?.map((m) => {
          const mine = m.sender === "staff";
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[80%] rounded-lg px-3 py-2 text-sm shadow-sm ${
                  mine ? "bg-primary text-primary-foreground" : "bg-card ring-1 ring-border"
                }`}
              >
                {m.sender === "assistant" && (
                  <p className="mb-0.5 flex items-center gap-1 text-[11px] font-semibold opacity-70">
                    <Bot className="h-3 w-3" /> {t("Asistente")}
                  </p>
                )}
                {m.category && CATEGORY_LABELS[m.category] && (
                  <span className="mb-1 inline-block rounded bg-gold/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gold-foreground">
                    {t(CATEGORY_LABELS[m.category])}
                  </span>
                )}
                <p className="whitespace-pre-wrap break-words">{m.body}</p>
                <p className="mt-1 text-right text-[10px] opacity-60">
                  {when(m.created_at)}
                  {mine && m.read_at ? t(" · leído") : ""}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={end} />
      </div>

      {!canOperate ? (
        <p className="border-t p-3 text-center text-xs text-muted-foreground">
          {t("La dirección de grupo consulta las conversaciones; responde la recepción del hotel.")}
        </p>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          className="flex items-end gap-2 border-t p-3"
        >
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={2}
            maxLength={2000}
            placeholder={t("Responder a {0}…", { 0: guestName })}
            aria-label={t("Respuesta")}
            className="min-h-[44px] flex-1 resize-none"
          />
          <Button type="submit" disabled={reply.isPending || !text.trim()} aria-label={t("Enviar")}>
            <SendHorizonal className="h-4 w-4" />
          </Button>
        </form>
      )}
    </>
  );
}
