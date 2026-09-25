import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Guest reviews through the database functions (get_reviews, get_my_review,
// submit_review, reply_review); the demo mock emulates the same functions.

export interface Review {
  id: string;
  property_id?: string | null;
  rating: number;
  scores: Record<string, number>;
  comment: string | null;
  author_name: string;
  created_at: string;
  reply: string | null;
  replied_at: string | null;
}

export interface ReviewPage {
  count: number;
  average: number | null;
  distribution: Record<string, number>;
  scores: Record<string, number>;
  reviews: Review[];
}

export function useReviews(filter: { property?: string; tenant?: string }, limit = 6) {
  return useQuery({
    queryKey: ["reviews", filter.property ?? null, filter.tenant ?? null, limit],
    enabled: !!(filter.property || filter.tenant),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_reviews", {
        p_property: filter.property,
        p_tenant: filter.tenant,
        p_limit: limit,
      });
      if (error) throw error;
      return data as unknown as ReviewPage;
    },
  });
}

/** The guest's own review of a stay (token for bookings without an account). */
export function useMyReview(reservationId: string, token: string | null, enabled = true) {
  return useQuery({
    queryKey: ["my-review", reservationId],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_my_review", {
        p_reservation_id: reservationId,
        p_token: token ?? undefined,
      });
      if (error) throw error;
      return (data as unknown as Review | null) ?? null;
    },
  });
}

export function useSubmitReview(reservationId: string, token: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      rating: number;
      scores: Record<string, number>;
      comment: string;
    }) => {
      const { error } = await supabase.rpc("submit_review", {
        p_reservation_id: reservationId,
        // null = signed-in member (the generated type marks it required).
        p_token: token as string,
        p_rating: input.rating,
        p_scores: input.scores,
        p_comment: input.comment,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-review", reservationId] });
      qc.invalidateQueries({ queryKey: ["reviews"] });
    },
  });
}
