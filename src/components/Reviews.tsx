import { useState } from "react";
import { Star } from "lucide-react";
import { toast } from "sonner";
import { REVIEW_SCORES, type ReviewScore } from "@domain/reviews.ts";
import { useMyReview, useSubmitReview, type Review, type ReviewPage } from "@/lib/reviews";

// Reviews on the public web and in the guest app (brand-coloured, square).

export function Stars({ value, size = 14 }: { value: number; size?: number }) {
  return (
    <span className="inline-flex" aria-label={`${value.toFixed(1)} de 5`}>
      {[1, 2, 3, 4, 5].map((i) => {
        const fill = Math.max(0, Math.min(1, value - i + 1));
        return (
          <span key={i} className="relative" style={{ width: size, height: size }}>
            <Star className="absolute text-neutral-300" style={{ width: size, height: size }} />
            <span className="absolute inset-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
              <Star
                className="fill-amber-400 text-amber-400"
                style={{ width: size, height: size }}
              />
            </span>
          </span>
        );
      })}
    </span>
  );
}

const dateLabel = (iso: string) =>
  new Date(iso).toLocaleDateString("es-ES", { month: "long", year: "numeric" });

export function ReviewSummary({ page }: { page: ReviewPage }) {
  if (!page.count || page.average == null) {
    return <p className="text-sm text-neutral-500">Todavía no hay valoraciones.</p>;
  }
  return (
    <div className="grid gap-6 sm:grid-cols-[auto_1fr]">
      <div>
        <p className="text-5xl font-bold tabular-nums">{page.average.toFixed(1)}</p>
        <Stars value={page.average} size={16} />
        <p className="mt-1 text-xs text-neutral-500">
          {page.count} valoraciones de estancias verificadas
        </p>
      </div>
      <div className="grid gap-6 sm:grid-cols-2">
        <div className="space-y-1.5">
          {[5, 4, 3, 2, 1].map((n) => {
            const count = page.distribution[n] ?? 0;
            return (
              <div key={n} className="flex items-center gap-2 text-xs">
                <span className="w-3 tabular-nums text-neutral-500">{n}</span>
                <div className="h-1.5 flex-1 bg-neutral-200">
                  <div
                    className="h-1.5 bg-[var(--brand)]"
                    style={{ width: `${(count / page.count) * 100}%` }}
                  />
                </div>
                <span className="w-8 text-right tabular-nums text-neutral-400">{count}</span>
              </div>
            );
          })}
        </div>
        <div className="space-y-1.5">
          {Object.entries(REVIEW_SCORES).map(([k, label]) =>
            page.scores[k] != null ? (
              <div key={k} className="flex items-center justify-between text-xs">
                <span className="text-neutral-600">{label}</span>
                <span className="font-semibold tabular-nums">{page.scores[k].toFixed(1)}</span>
              </div>
            ) : null,
          )}
        </div>
      </div>
    </div>
  );
}

export function ReviewCard({ review, hotelName }: { review: Review; hotelName?: string }) {
  return (
    <article className="bg-white p-4 shadow-sm ring-1 ring-neutral-100">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold">{review.author_name}</span>
        <Stars value={review.rating} />
      </div>
      <p className="text-xs text-neutral-400">{dateLabel(review.created_at)}</p>
      {review.comment && <p className="mt-2 text-sm text-neutral-700">{review.comment}</p>}
      {review.reply && (
        <div className="mt-3 border-l-2 border-[var(--brand)] bg-neutral-50 px-3 py-2 text-sm">
          <p className="text-xs font-semibold text-neutral-500">
            Respuesta de {hotelName ?? "el hotel"}
          </p>
          <p className="mt-0.5 text-neutral-700">{review.reply}</p>
        </div>
      )}
    </article>
  );
}

function StarInput({
  value,
  onChange,
  size = 28,
  label,
}: {
  value: number;
  onChange: (n: number) => void;
  size?: number;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} de 5`}
          onClick={() => onChange(n)}
          className="p-0.5"
        >
          <Star
            style={{ width: size, height: size }}
            className={n <= value ? "fill-amber-400 text-amber-400" : "text-neutral-300"}
          />
        </button>
      ))}
    </div>
  );
}

/**
 * After a completed stay: the guest's review, or the form to leave one.
 * `token` is the booking token for guests without an account.
 */
export function GuestReview({
  reservationId,
  token,
  completed,
}: {
  reservationId: string;
  token: string | null;
  completed: boolean;
}) {
  const { data: mine, isPending } = useMyReview(reservationId, token, completed);
  const submit = useSubmitReview(reservationId, token);
  const [rating, setRating] = useState(0);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [comment, setComment] = useState("");

  if (!completed || isPending) return null;
  if (mine) {
    return (
      <section className="mt-4">
        <h3 className="mb-2 text-sm font-semibold">Tu valoración</h3>
        <ReviewCard review={mine} />
      </section>
    );
  }

  return (
    <section className="mt-4 bg-white p-5 shadow-sm ring-1 ring-neutral-100">
      <h3 className="font-semibold">¿Qué tal tu estancia?</h3>
      <p className="text-sm text-neutral-500">
        Tu opinión se publica en la web del hotel con tu nombre y la inicial del apellido.
      </p>
      <div className="mt-3">
        <StarInput value={rating} onChange={setRating} label="Nota general" />
      </div>
      {rating > 0 && (
        <>
          <div className="mt-4 space-y-2">
            {Object.entries(REVIEW_SCORES).map(([k, label]) => (
              <div key={k} className="flex items-center justify-between gap-3">
                <span className="text-sm text-neutral-600">{label}</span>
                <StarInput
                  size={20}
                  label={label}
                  value={scores[k as ReviewScore] ?? 0}
                  onChange={(n) => setScores((s) => ({ ...s, [k]: n }))}
                />
              </div>
            ))}
          </div>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={2000}
            rows={4}
            placeholder="Cuéntanos qué te gustó y qué mejorarías (opcional)"
            className="mt-4 w-full border border-neutral-200 px-3 py-2 text-sm"
          />
          <button
            type="button"
            disabled={submit.isPending}
            onClick={() =>
              submit.mutate(
                { rating, scores, comment },
                {
                  onSuccess: () => toast.success("¡Gracias por tu valoración!"),
                  onError: (e) => toast.error(e.message),
                },
              )
            }
            className="mt-3 w-full bg-[var(--brand)] py-3 font-semibold text-white disabled:opacity-50"
          >
            {submit.isPending ? "Enviando…" : "Publicar valoración"}
          </button>
        </>
      )}
    </section>
  );
}
