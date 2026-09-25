import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { MessageSquareReply, Star } from "lucide-react";
import { toast } from "sonner";
import { bookingReference } from "@domain/reference.ts";
import { REVIEW_SCORES } from "@domain/reviews.ts";
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
import { useReviews } from "@/lib/reviews";
import { useStaffHotels } from "@/lib/reports";

export const Route = createFileRoute("/_app/reviews")({
  component: ReviewsPage,
});

type Filter = "all" | "unanswered" | "low";

function StarsRow({ value }: { value: number }) {
  return (
    <span className="inline-flex" aria-label={`${value} de 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={`h-3.5 w-3.5 ${i <= value ? "fill-gold text-gold" : "text-muted-foreground/30"}`}
        />
      ))}
    </span>
  );
}

// Guest reviews of the hotel: published as soon as they are written (they can
// not be hidden); the hotel answers them here.
function ReviewsPage() {
  const qc = useQueryClient();
  const { data: hotels } = useStaffHotels();
  const [hotel, setHotel] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [replying, setReplying] = useState<string | null>(null);
  const [text, setText] = useState("");

  useEffect(() => {
    if (!hotel && hotels?.length) setHotel(hotels[0].id);
  }, [hotel, hotels]);

  const { data: summary } = useReviews({ tenant: hotel ?? undefined }, 1);
  const { data: reviews } = useQuery({
    queryKey: ["reviews", "staff", hotel, filter],
    enabled: !!hotel,
    queryFn: async () => {
      let q = supabase
        .from("reviews")
        .select(
          "id, reservation_id, property_id, rating, scores, comment, author_name, created_at, reply",
        )
        .eq("tenant_id", hotel!)
        .order("created_at", { ascending: false })
        .limit(100);
      if (filter === "unanswered") q = q.is("reply", null);
      if (filter === "low") q = q.lte("rating", 3);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const reply = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: string }) => {
      const { error } = await supabase.rpc("reply_review", { p_review_id: id, p_reply: body });
      if (error) throw error;
    },
    onSuccess: () => {
      setReplying(null);
      setText("");
      qc.invalidateQueries({ queryKey: ["reviews"] });
      toast.success("Respuesta publicada");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Reseñas</h1>
          <p className="text-sm text-muted-foreground">
            Valoraciones de estancias verificadas. Se publican al momento; responde desde aquí.
          </p>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          {hotels && hotels.length > 1 && (
            <Select value={hotel ?? undefined} onValueChange={setHotel}>
              <SelectTrigger className="min-w-0 flex-1 sm:w-48 sm:flex-none">
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
          <Select value={filter} onValueChange={(v) => setFilter(v as Filter)}>
            <SelectTrigger className="min-w-0 flex-1 sm:w-44 sm:flex-none">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="unanswered">Sin responder</SelectItem>
              <SelectItem value="low">3 estrellas o menos</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {summary && summary.average != null && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 [&>*]:min-w-0">
          <Card className="border-gold/50">
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground">Valoración media</div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-2xl font-bold tabular-nums">
                  {summary.average.toFixed(2)}
                </span>
                <StarsRow value={Math.round(summary.average)} />
              </div>
              <div className="text-xs text-muted-foreground">{summary.count} reseñas</div>
            </CardContent>
          </Card>
          <Card className="lg:col-span-3">
            <CardContent className="grid gap-6 p-4 sm:grid-cols-2">
              <div className="space-y-1">
                {Object.entries(REVIEW_SCORES).map(([k, label]) =>
                  summary.scores[k] != null ? (
                    <div key={k} className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate text-muted-foreground">{label}</span>
                      <span className="font-semibold tabular-nums">
                        {summary.scores[k].toFixed(1)}
                      </span>
                    </div>
                  ) : null,
                )}
              </div>
              <div className="space-y-1.5">
                {[5, 4, 3, 2, 1].map((n) => {
                  const count = summary.distribution[n] ?? 0;
                  return (
                    <div key={n} className="flex items-center gap-2 text-xs">
                      <span className="w-6 text-muted-foreground">{n} ★</span>
                      <div className="h-1.5 flex-1 rounded-full bg-muted">
                        <div
                          className="h-1.5 rounded-full bg-gold"
                          style={{ width: `${(count / summary.count) * 100}%` }}
                        />
                      </div>
                      <span className="w-8 text-right tabular-nums">{count}</span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="space-y-3">
        {reviews?.map((r) => (
          <Card key={r.id}>
            <CardContent className="space-y-2 p-4">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <StarsRow value={r.rating} />
                <span className="font-medium">{r.author_name}</span>
                <span className="text-xs text-muted-foreground">
                  {new Date(r.created_at).toLocaleDateString("es-ES", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </span>
                <span className="font-mono text-xs text-muted-foreground">
                  Ref. {bookingReference(r.reservation_id)}
                </span>
              </div>
              {r.comment ? (
                <p className="text-sm">{r.comment}</p>
              ) : (
                <p className="text-sm italic text-muted-foreground">Sin comentario.</p>
              )}
              {replying === r.id ? (
                <div className="space-y-2 border-t pt-3">
                  <Textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    rows={3}
                    maxLength={2000}
                    placeholder="Respuesta pública del hotel"
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      disabled={reply.isPending || !text.trim()}
                      onClick={() => reply.mutate({ id: r.id, body: text })}
                    >
                      Publicar respuesta
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setReplying(null)}>
                      Cancelar
                    </Button>
                  </div>
                </div>
              ) : r.reply ? (
                <div className="border-l-2 border-info bg-info/5 px-3 py-2 text-sm">
                  <p className="text-xs font-semibold text-muted-foreground">Respuesta del hotel</p>
                  <p>{r.reply}</p>
                  <button
                    type="button"
                    className="mt-1 text-xs text-muted-foreground underline"
                    onClick={() => {
                      setReplying(r.id);
                      setText(r.reply ?? "");
                    }}
                  >
                    Editar
                  </button>
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setReplying(r.id);
                    setText("");
                  }}
                >
                  <MessageSquareReply className="mr-1 h-3.5 w-3.5" /> Responder
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
        {reviews && reviews.length === 0 && (
          <p className="py-10 text-center text-sm text-muted-foreground">No hay reseñas.</p>
        )}
      </div>
    </div>
  );
}
