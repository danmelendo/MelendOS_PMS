import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Database, RotateCcw, SendHorizonal, Sparkles } from "lucide-react";
import { COPILOT_TOOL_LABELS } from "@shared/copilot/tools.ts";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Formatted } from "@/components/FormattedText";
import { ModuleOff } from "@/components/ModuleOff";
import { useHotelsWith } from "@/lib/features";

export const Route = createFileRoute("/_app/copilot")({
  component: CopilotPage,
});

interface Line {
  role: "user" | "assistant" | "error";
  text: string;
  tools?: string[];
}

const SUGGESTIONS = [
  "¿Qué habitación se reserva menos entre semana?",
  "¿Cómo va la ocupación de este mes frente al año pasado?",
  "Resume las peticiones de los huéspedes de este mes",
  "¿Qué tengo pendiente ahora mismo?",
  "¿Qué noches de la semana se venden peor?",
  "¿Cómo están las reseñas de los últimos 90 días?",
];

// Questions about the business in plain language, answered with the hotel's
// data (admin-copilot function). Read-only: it never changes anything.
function CopilotPage() {
  const { data: hotels } = useHotelsWith("copilot");
  const [hotel, setHotel] = useState<string | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!hotel && hotels?.length) setHotel(hotels[0].id);
  }, [hotel, hotels]);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [lines.length, busy]);

  if (hotels && hotels.length === 0) return <ModuleOff feature="copilot" hotel="tus hoteles" />;

  const reset = () => {
    setLines([]);
    setConversationId(null);
  };

  const ask = async (question: string) => {
    const q = question.trim();
    if (!q || busy || !hotel) return;
    setText("");
    setLines((l) => [...l, { role: "user", text: q }]);
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-copilot", {
        body: { message: q, tenant_id: hotel, conversation_id: conversationId },
      });
      if (error || !data?.reply) {
        let message = "El copiloto no ha podido responder. Inténtalo de nuevo.";
        try {
          const body = await (error as { context?: Response })?.context?.json();
          if (body?.error) message = body.error;
        } catch {
          /* keep the generic message */
        }
        setLines((l) => [...l, { role: "error", text: message }]);
        return;
      }
      setConversationId(data.conversation_id);
      setLines((l) => [...l, { role: "assistant", text: data.reply, tools: data.tools }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-[calc(100dvh-7rem)] flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Sparkles className="h-5 w-5 text-gold" /> Copiloto
          </h1>
          <p className="text-sm text-muted-foreground">
            Pregunta por el negocio en lenguaje natural. Responde con los datos del hotel y no
            cambia nada.
          </p>
        </div>
        <div className="flex w-full gap-2 sm:w-auto">
          {hotels && hotels.length > 1 && (
            <Select
              value={hotel ?? undefined}
              onValueChange={(v) => {
                setHotel(v);
                reset();
              }}
            >
              <SelectTrigger className="min-w-0 flex-1 sm:w-52 sm:flex-none">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {hotels.map((h) => (
                  <SelectItem key={h.id} value={h.id}>
                    {h.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {lines.length > 0 && (
            <Button variant="outline" onClick={reset} disabled={busy}>
              <RotateCcw className="mr-1 h-4 w-4" /> Nueva
            </Button>
          )}
        </div>
      </div>

      <Card className="flex flex-1 flex-col">
        <CardContent className="flex flex-1 flex-col gap-3 p-4">
          {lines.length === 0 ? (
            <div className="flex flex-1 flex-col justify-center gap-3">
              <p className="text-sm text-muted-foreground">Prueba con alguna de estas:</p>
              <div className="flex flex-wrap gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => ask(s)}
                    disabled={!hotel}
                    className="rounded-full border bg-background px-3 py-1.5 text-left text-sm hover:bg-accent disabled:opacity-50"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex-1 space-y-3" aria-live="polite">
              {lines.map((l, i) =>
                l.role === "user" ? (
                  <div key={i} className="flex justify-end">
                    <div className="max-w-[85%] rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground">
                      {l.text}
                    </div>
                  </div>
                ) : (
                  <div key={i} className="max-w-[92%] space-y-1.5">
                    <div
                      className={`rounded-lg px-3 py-2 text-sm ${
                        l.role === "error"
                          ? "bg-destructive/10 text-destructive"
                          : "bg-muted text-foreground"
                      }`}
                    >
                      <Formatted text={l.text} />
                    </div>
                    {!!l.tools?.length && (
                      <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                        <Database className="h-3.5 w-3.5" /> Datos consultados:
                        {l.tools.map((t) => (
                          <span key={t} className="rounded bg-info/10 px-1.5 py-0.5 text-info">
                            {COPILOT_TOOL_LABELS[t] ?? t}
                          </span>
                        ))}
                      </p>
                    )}
                  </div>
                ),
              )}
              {busy && <p className="text-sm text-muted-foreground">Consultando los datos…</p>}
              <div ref={end} />
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              ask(text);
            }}
            className="flex items-end gap-2 border-t pt-3"
          >
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  ask(text);
                }
              }}
              rows={1}
              maxLength={1000}
              placeholder="¿Qué quieres saber del negocio?"
              className="min-h-10 resize-none"
              aria-label="Pregunta al copiloto"
            />
            <Button type="submit" size="icon" disabled={busy || !text.trim() || !hotel}>
              <SendHorizonal className="h-4 w-4" />
              <span className="sr-only">Enviar</span>
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
