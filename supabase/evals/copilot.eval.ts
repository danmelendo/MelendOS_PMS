// Admin copilot evals: real questions against a real model and the demo
// database, read with a real staff session (row level security applies).
// Scored by what it did: the right tool, and an answer faithful to what that
// tool returned (the expected figure is recomputed with the model's own
// arguments). The copilot is read-only, so nothing needs cleaning up.
//
//   npm run eval:copilot                    # local Ollama, model stays-agent-7b
//   EVAL_BASE_URL=https://api.provider/v1 EVAL_API_KEY=... EVAL_MODEL=... npm run eval:copilot
//
// Needs SUPABASE_URL, SUPABASE_SECRET_KEY and SUPABASE_PUBLISHABLE_KEY (.env).
import { mkdirSync, writeFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { addDays, ymdInZone } from "../functions/_shared/domain/dates.ts";
import { openAiCompatible, type LlmClient } from "../functions/_shared/agent/llm.ts";
import { runAgentTurn, type TurnResult } from "../functions/_shared/agent/loop.ts";
import { copilotPrompt } from "../functions/_shared/copilot/prompt.ts";
import { supabaseCopilotStore } from "../functions/_shared/copilot/supabase-store.ts";
import {
  copilotToolSpecs,
  runCopilotTool,
  type CopilotContext,
  type CopilotStore,
} from "../functions/_shared/copilot/tools.ts";

const { SUPABASE_URL, SUPABASE_SECRET_KEY, SUPABASE_PUBLISHABLE_KEY } = process.env;
const MODEL = process.env.EVAL_MODEL ?? "stays-agent-7b";
const BASE_URL = process.env.EVAL_BASE_URL ?? "http://127.0.0.1:11434/v1";
const MIN_PASS = Number(process.env.EVAL_MIN_PASS ?? 0.7);

type Call = { name: string; args: Record<string, unknown> };
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- tool outputs are plain JSON
type Data = any;

const callsOf = (t: TurnResult): Call[] =>
  t.messages.flatMap((m) =>
    m.role === "assistant" && m.tool_calls
      ? m.tool_calls.map((c) => {
          let args: Record<string, unknown> = {};
          try {
            args = JSON.parse(c.function.arguments || "{}");
          } catch {
            /* invalid JSON counts as no args */
          }
          return { name: c.function.name, args };
        })
      : [],
  );

/** 78.1 → matches "78,1" or "78.1" in the reply. */
const mentions = (reply: string, n: number) => {
  const s = String(n);
  return reply.includes(s) || reply.includes(s.replace(".", ","));
};

describe.skipIf(!SUPABASE_URL || !SUPABASE_SECRET_KEY || !SUPABASE_PUBLISHABLE_KEY)(
  `admin copilot · ${MODEL}`,
  () => {
    let llm: LlmClient;
    let store: CopilotStore;
    let ctx: CopilotContext;
    let system: string;
    const results: { name: string; ok: boolean; why: string | null; seconds: number }[] = [];

    /** What a tool returns for these arguments (the ground truth). */
    const truth = async (call: Call): Promise<Data> => {
      const res = await runCopilotTool(call.name, call.args, store, ctx);
      if (!res.ok) throw new Error(`${call.name}: ${res.error.message}`);
      return res.data;
    };

    beforeAll(async () => {
      const service: SupabaseClient = createClient(SUPABASE_URL!, SUPABASE_SECRET_KEY!, {
        auth: { persistSession: false },
      });
      const { data: link } = await service.auth.admin.generateLink({
        type: "magiclink",
        email: "admin@lumen.demostays.example",
      });
      const user = createClient(SUPABASE_URL!, SUPABASE_PUBLISHABLE_KEY!, {
        auth: { persistSession: false },
      });
      const { error } = await user.auth.verifyOtp({
        token_hash: link!.properties!.hashed_token,
        type: "magiclink",
      });
      if (error) throw error;
      const { data: t } = await service
        .from("tenants")
        .select("id, name")
        .eq("slug", "hotel-lumen")
        .single();
      const now = new Date();
      const today = ymdInZone(now, "Europe/Madrid");
      store = supabaseCopilotStore(user);
      ctx = { tenantId: t!.id, today, timezone: "Europe/Madrid" };
      system = copilotPrompt({
        hotel: t!.name,
        today,
        weekday: new Intl.DateTimeFormat("es-ES", {
          weekday: "long",
          timeZone: "Europe/Madrid",
        }).format(now),
      });
      llm = openAiCompatible({ baseUrl: BASE_URL, apiKey: process.env.EVAL_API_KEY, model: MODEL });
    });

    const scenarios: {
      name: string;
      question: string;
      check: (r: { calls: Call[]; reply: string; turn: TurnResult }) => Promise<string | null>;
    }[] = [
      {
        name: "habitación menos reservada entre semana",
        question: "¿Qué habitación se reserva menos entre semana?",
        async check({ calls, reply }) {
          const c = calls.find((x) => x.name === "room_performance");
          if (!c) return "no consultó el rendimiento por habitación";
          if (c.args.nights !== "weekday") return `nights=${c.args.nights}`;
          const least = (await truth(c)).rooms[0]?.room;
          return reply.includes(least) ? null : `no nombra la ${least}: «${reply.slice(0, 140)}»`;
        },
      },
      {
        name: "ocupación del mes frente al año pasado",
        question: "¿Cómo va la ocupación de este mes comparada con el año pasado?",
        async check({ calls, reply }) {
          const c = calls.find((x) => x.name === "business_summary");
          if (!c) return "no consultó el resumen del negocio";
          if (!c.args.compare_previous_year) return "no comparó con el año pasado";
          if (c.args.from !== `${ctx.today.slice(0, 8)}01`) return `desde ${c.args.from}`;
          const data = await truth(c);
          const now = data.period.occupancy_pct;
          const before = data.same_period_last_year.occupancy_pct;
          return mentions(reply, now) && mentions(reply, before)
            ? null
            : `cifras ${now} / ${before} no aparecen: «${reply.slice(0, 160)}»`;
        },
      },
      {
        name: "pendientes",
        question: "¿Qué tengo pendiente ahora mismo?",
        async check({ calls, reply }) {
          const c = calls.find((x) => x.name === "pending_actions");
          if (!c) return "no consultó los pendientes";
          const data = await truth(c);
          return mentions(reply, data.unanswered_reviews)
            ? null
            : `no dice las ${data.unanswered_reviews} reseñas sin responder`;
        },
      },
      {
        name: "peor noche de la semana",
        question: "¿Qué noche de la semana se vende peor en los últimos 90 días?",
        async check({ calls, reply }) {
          const c = calls.find((x) => x.name === "occupancy_by_weekday");
          if (!c) return "no consultó la ocupación por día";
          const from = String(c.args.from);
          if (from < addDays(ctx.today, -92) || from > addDays(ctx.today, -88))
            return `desde ${from}`;
          const nights = (await truth(c)).nights as { night: string; occupancy_pct: number }[];
          const worst = [...nights].sort((a, b) => a.occupancy_pct - b.occupancy_pct)[0].night;
          return reply.toLowerCase().includes(worst)
            ? null
            : `no dice ${worst}: «${reply.slice(0, 140)}»`;
        },
      },
      {
        name: "reseñas recientes",
        question: "¿Cómo están las reseñas de los últimos 90 días?",
        async check({ calls, reply }) {
          const c = calls.find((x) => x.name === "reviews_summary");
          if (!c) return "no consultó las reseñas";
          const avg = (await truth(c)).average_rating;
          return avg == null || mentions(reply, avg) ? null : `no da la media ${avg}`;
        },
      },
      {
        name: "no cambia precios y dice dónde hacerlo",
        question: "Sube un 10 % las tarifas del fin de semana.",
        async check({ reply }) {
          return /tarifas/i.test(reply) && !/he subido|he actualizado|hecho/i.test(reply)
            ? null
            : `«${reply.slice(0, 140)}»`;
        },
      },
      {
        name: "no escribe código",
        question: "Escríbeme una función en Python que ordene una lista.",
        async check({ reply }) {
          return /def |```|sorted\(/.test(reply) ? "escribió código" : null;
        },
      },
    ];

    it("runs the scenarios", async () => {
      for (const s of scenarios) {
        const t0 = Date.now();
        let failure: string | null = null;
        try {
          const turn = await runAgentTurn({
            llm,
            tools: {
              specs: copilotToolSpecs(),
              run: (name, args) => runCopilotTool(name, args, store, ctx),
            },
            system,
            history: [],
            userMessage: s.question,
          });
          failure = /\b[a-z]+(?:_[a-z]+)+\b/.test(turn.reply)
            ? `muestra detalles internos: «${turn.reply.slice(0, 120)}»`
            : await s.check({ calls: callsOf(turn), reply: turn.reply, turn });
        } catch (e) {
          failure = `error: ${(e as Error).message}`;
        }
        results.push({
          name: s.name,
          ok: !failure,
          why: failure,
          seconds: (Date.now() - t0) / 1000,
        });
      }
      const passed = results.filter((r) => r.ok).length;
      const report = [
        `Copilot evals · ${MODEL} · ${passed}/${results.length} passed · ${new Date().toISOString()}`,
        ...results.map(
          (r) =>
            `${r.ok ? "PASS" : "FAIL"}  ${r.name} (${r.seconds.toFixed(1)} s)${r.why ? `  — ${r.why}` : ""}`,
        ),
      ].join("\n");
      mkdirSync("supabase/evals/results", { recursive: true });
      writeFileSync(
        `supabase/evals/results/copilot-${MODEL.replace(/[^\w.-]/g, "_")}.txt`,
        report + "\n",
      );
      console.log(`\n${report}`);
      expect(passed / results.length).toBeGreaterThanOrEqual(MIN_PASS);
    });
  },
);
