import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Sparkles, Gift, TrendingUp, Check } from "lucide-react";
import { toast } from "sonner";
import { pms } from "@/integrations/pms";
import { useMember } from "@/lib/member-session";
import { useFeatures } from "@/lib/features";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/stays/loyalty")({
  component: LoyaltyScreen,
});

function LoyaltyScreen() {
  const { memberId, member } = useMember();
  const qc = useQueryClient();
  const features = useFeatures();

  const { data: account } = useQuery({
    queryKey: ["pms", "loyalty", memberId],
    queryFn: () => pms.getLoyaltyAccount(memberId),
  });
  const { data: rewards } = useQuery({
    queryKey: ["pms", "rewards", memberId],
    queryFn: () => pms.listRewards(memberId),
  });
  const { data: txns } = useQuery({
    queryKey: ["pms", "loyalty-txns", memberId],
    queryFn: () => pms.listLoyaltyTransactions(memberId),
  });

  const redeem = useMutation({
    mutationFn: (rewardId: string) => pms.redeemReward(memberId, rewardId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pms"] });
      toast.success("Recompensa canjeada 🎉");
    },
    onError: (e: Error) => toast.error(e.message || "No se pudo canjear"),
  });

  if (features.ready && !features.loyalty) {
    return (
      <div className="px-5 py-16 text-center">
        <p className="font-semibold">Este hotel no tiene club de fidelización</p>
        <p className="mt-1 text-sm text-neutral-500">
          Tus datos de huésped y tus estancias están en tu cuenta.
        </p>
        <Link
          to="/stays/account"
          className="mt-4 inline-block text-sm text-[var(--brand)] underline"
        >
          Ir a mi cuenta
        </Link>
      </div>
    );
  }
  if (!account) return <p className="px-5 py-16 text-center text-sm text-neutral-400">Cargando…</p>;

  const progress = account.nextTier
    ? Math.min(100, Math.round((account.lifetimePoints / account.nextTier.minPoints) * 100))
    : 100;

  return (
    <div className="px-5 pt-6">
      <h1 className="mb-4 flex items-center gap-2 text-2xl font-semibold tracking-tight">
        <Sparkles className="h-6 w-6 text-[var(--brand)]" /> Demo Stays Club
      </h1>

      {/* Membership card */}
      <div className="relative overflow-hidden  bg-gradient-to-br from-[var(--brand)] via-[#1b2a44] to-[#0b1220] p-5 text-white shadow-lg">
        <div className="absolute -right-8 -top-8 h-32 w-32  bg-white/10" />
        <div className="relative flex items-start justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] opacity-70">
              Socio {account.tier.name}
            </p>
            <p className="mt-1 text-lg font-semibold">{member?.name ?? "Socio Stays"}</p>
          </div>
          <span className=" bg-white/15 px-3 py-1 text-xs font-medium">{account.tier.name}</span>
        </div>
        <div className="relative mt-6 flex items-end justify-between">
          <div>
            <p className="text-3xl font-bold">{account.points.toLocaleString("es-ES")}</p>
            <p className="text-xs opacity-70">puntos disponibles</p>
          </div>
          <p className="font-mono text-sm tracking-widest opacity-80">{account.memberNumber}</p>
        </div>
      </div>

      {/* Progress to next tier */}
      <div className="mt-4  bg-white p-4 shadow-sm ring-1 ring-neutral-100">
        {account.nextTier ? (
          <>
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="flex items-center gap-1.5 font-medium text-neutral-700">
                <TrendingUp className="h-4 w-4 text-[var(--brand)]" /> Hacia {account.nextTier.name}
              </span>
              <span className="text-neutral-500">{account.pointsToNextTier} pts</span>
            </div>
            <div className="h-2 overflow-hidden  bg-neutral-100">
              <div className="h-full  bg-[var(--brand)]" style={{ width: `${progress}%` }} />
            </div>
            <p className="mt-1.5 text-xs text-neutral-400">
              {account.lifetimePoints.toLocaleString("es-ES")} pts acumulados de por vida
            </p>
          </>
        ) : (
          <p className="text-sm font-medium text-neutral-700">Has alcanzado el nivel máximo 🏆</p>
        )}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {account.tier.perks.map((perk) => (
            <span
              key={perk}
              className=" bg-[var(--brand-soft)] px-2.5 py-1 text-xs font-medium text-[var(--brand)]"
            >
              {perk}
            </span>
          ))}
        </div>
      </div>

      {/* Rewards */}
      <h2 className="mb-2 mt-6 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-neutral-400">
        <Gift className="h-4 w-4" /> Recompensas
      </h2>
      <div className="space-y-3">
        {(rewards ?? []).map((r) => {
          const affordable = account.points >= r.costPoints;
          return (
            <div
              key={r.id}
              className="flex items-center gap-3  bg-white p-4 shadow-sm ring-1 ring-neutral-100"
            >
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold text-neutral-900">{r.name}</h3>
                <p className="text-xs text-neutral-500">{r.description}</p>
                <p className="mt-1 text-sm font-semibold text-[var(--brand)]">
                  {r.costPoints.toLocaleString("es-ES")} pts
                </p>
              </div>
              <button
                disabled={!affordable || redeem.isPending}
                onClick={() => redeem.mutate(r.id)}
                className={`shrink-0  px-4 py-2 text-sm font-semibold ${
                  affordable ? "bg-[var(--brand)] text-white" : "bg-neutral-100 text-neutral-400"
                }`}
              >
                {affordable ? "Canjear" : "Faltan pts"}
              </button>
            </div>
          );
        })}
      </div>

      {/* Ledger */}
      <h2 className="mb-2 mt-6 text-sm font-semibold uppercase tracking-wider text-neutral-400">
        Movimientos
      </h2>
      <div className=" bg-white shadow-sm ring-1 ring-neutral-100">
        {(txns ?? []).map((t, i) => (
          <div
            key={t.id}
            className={`flex items-center justify-between px-4 py-3 ${i > 0 ? "border-t border-neutral-100" : ""}`}
          >
            <div className="flex items-center gap-2">
              <span
                className={`flex h-7 w-7 items-center justify-center  ${t.type === "earn" ? "bg-emerald-100 text-emerald-600" : "bg-rose-100 text-rose-600"}`}
              >
                {t.type === "earn" ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <Gift className="h-3.5 w-3.5" />
                )}
              </span>
              <div>
                <p className="text-sm font-medium text-neutral-800">{t.reason}</p>
                <p className="text-[11px] text-neutral-400">
                  {new Date(t.createdAt).toLocaleDateString("es-ES", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </p>
              </div>
            </div>
            <span
              className={`text-sm font-semibold ${t.points >= 0 ? "text-emerald-600" : "text-rose-600"}`}
            >
              {t.points >= 0 ? "+" : ""}
              {t.points}
            </span>
          </div>
        ))}
        {(txns ?? []).length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-neutral-400">Sin movimientos.</p>
        )}
      </div>

      <p className="mt-4 pb-2 text-center text-[11px] text-neutral-400">
        Puntos y niveles servidos por {pms.pmsName} vía API
      </p>
    </div>
  );
}
