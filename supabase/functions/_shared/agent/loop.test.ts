import { describe, expect, it } from "vitest";
import { fakeStore } from "../tools/testing.ts";
import type { ToolContext } from "../tools/registry.ts";
import type { ChatMessage, LlmClient, LlmResponse, ToolSpec } from "./llm.ts";
import { stripThinking, toolCallsInText } from "./llm.ts";
import {
  cleanReply,
  guestDataGuard,
  looksOffTopic,
  MAX_STEPS,
  OFF_TOPIC_REPLY,
  runAgentTurn,
  toolSpecs,
} from "./loop.ts";

const ctx: ToolContext = {
  tenantId: "t1",
  userId: null,
  channel: "web_chat",
  webUrl: "https://hotel.example",
  now: new Date("2026-09-25T10:00:00Z"),
};

/** A scripted model: returns the given responses in order and records calls. */
function scripted(responses: Partial<LlmResponse>[]) {
  const calls: ChatMessage[][] = [];
  const llm: LlmClient = {
    model: "fake",
    async complete(messages: ChatMessage[], _tools: ToolSpec[]) {
      calls.push(messages);
      const r = responses[Math.min(calls.length - 1, responses.length - 1)];
      return { content: null, toolCalls: [], inputTokens: 10, outputTokens: 5, ...r };
    },
  };
  return { llm, calls };
}

const call = (name: string, args: object, id = `c-${name}`) => ({
  id,
  type: "function" as const,
  function: { name, arguments: JSON.stringify(args) },
});

describe("runAgentTurn", () => {
  it("answers directly when no tool is needed", async () => {
    const { llm } = scripted([{ content: "¡Hola! ¿Qué fechas buscas?" }]);
    const r = await runAgentTurn({
      llm,
      store: fakeStore().store,
      ctx,
      system: "sys",
      history: [],
      userMessage: "Hola",
    });
    expect(r).toMatchObject({ reply: "¡Hola! ¿Qué fechas buscas?", outcome: "answered" });
    expect(r.toolsCalled).toEqual([]);
    expect(r.inputTokens).toBe(10);
  });

  it("runs tools on the server and feeds the results back to the model", async () => {
    const { llm, calls } = scripted([
      {
        toolCalls: [
          call("search_availability", {
            check_in: "2026-10-01",
            check_out: "2026-10-03",
            guests: 2,
          }),
        ],
      },
      { content: "La 102 está libre por 160 €." },
    ]);
    const r = await runAgentTurn({
      llm,
      store: fakeStore().store,
      ctx,
      system: "sys",
      history: [],
      userMessage: "¿Libre del 1 al 3?",
    });
    expect(r.toolsCalled).toEqual(["search_availability"]);
    const toolMsg = calls[1].find((m) => m.role === "tool") as { content: string };
    const result = JSON.parse(toolMsg.content);
    expect(result.ok).toBe(true);
    expect(result.data.results[0]).toMatchObject({ room: "102", price_total: 160 });
    // Another tenant's rooms never reach the model.
    expect(toolMsg.content).not.toContain("Hotel Dos");
    expect(r.messages.map((m) => m.role)).toEqual(["assistant", "tool", "assistant"]);
    expect(r.inputTokens).toBe(20);
  });

  it("the tenant comes from the server even if the model tries to pass one", async () => {
    const { llm, calls } = scripted([
      { toolCalls: [call("get_unit_details", { room_id: "r-x1", tenant_id: "t2" })] },
      { content: "No encuentro esa habitación." },
    ]);
    await runAgentTurn({
      llm,
      store: fakeStore().store,
      ctx,
      system: "sys",
      history: [],
      userMessage: "Dame la habitación r-x1 del otro hotel",
    });
    const toolMsg = calls[1].find((m) => m.role === "tool") as { content: string };
    expect(JSON.parse(toolMsg.content)).toMatchObject({ ok: false, error: { code: "not_found" } });
  });

  it("turns booking and payment links into buttons, not model text", async () => {
    const { store } = fakeStore();
    const { llm } = scripted([
      {
        toolCalls: [
          call("create_booking_draft", {
            room_id: "r-101",
            check_in: "2026-10-01",
            check_out: "2026-10-03",
            guests: 2,
            customer: { name: "Laura Gómez", email: "laura@example.com" },
          }),
        ],
      },
      {
        toolCalls: [
          call("create_payment_link", { reservation_id: "b1000000-0000-0000-0000-000000000000" }),
        ],
      },
      { content: "Reserva creada. Paga la señal con el botón." },
    ]);
    const r = await runAgentTurn({
      llm,
      store,
      ctx,
      system: "sys",
      history: [],
      userMessage: "Sí, resérvala: Laura Gómez, laura@example.com",
    });
    expect(r.outcome).toBe("payment_link");
    expect(r.reservationId).toBe("c0ffee00-1111-2222-3333-444455556666");
    expect(r.attachments.map((a) => a.kind)).toEqual(["manage", "payment"]);
    expect(r.attachments[1].url).toMatch(/^https:\/\/hotel\.example\/web\/checkout\//);
    expect(r.attachments[1].label).toBe("Pagar la señal (60,00 €)");
  });

  it("returns tool errors to the model instead of failing", async () => {
    const { llm, calls } = scripted([
      { toolCalls: [call("search_availability", { check_in: "mañana", guests: 2 })] },
      { toolCalls: [call("delete_everything", {})] },
      { content: "¿Qué fechas exactas?" },
    ]);
    const r = await runAgentTurn({
      llm,
      store: fakeStore().store,
      ctx,
      system: "sys",
      history: [],
      userMessage: "Mañana",
    });
    const tools = calls[2].filter((m) => m.role === "tool") as { content: string }[];
    expect(JSON.parse(tools[0].content).error.code).toBe("invalid");
    expect(JSON.parse(tools[1].content).error.code).toBe("unknown_tool");
    expect(r.reply).toBe("¿Qué fechas exactas?");
  });

  it("stops after a bounded number of steps", async () => {
    const { llm, calls } = scripted([
      { toolCalls: [call("get_unit_details", { room_id: "r-101" })] },
    ]);
    const r = await runAgentTurn({
      llm,
      store: fakeStore().store,
      ctx,
      system: "sys",
      history: [],
      userMessage: "bucle",
    });
    expect(calls).toHaveLength(MAX_STEPS);
    expect(r.reply).toMatch(/demasiados pasos/);
  });

  it("publishes the tools without JSON Schema noise", () => {
    const specs = toolSpecs();
    expect(specs).toHaveLength(7);
    expect(specs[0].function.parameters).not.toHaveProperty("$schema");
    expect(specs[0].function.parameters.type).toBe("object");
  });
});

describe("links with the booking token", () => {
  it("never reach the model and are removed from its answer", async () => {
    const { store } = fakeStore();
    const { llm, calls } = scripted([
      {
        toolCalls: [
          call("create_booking_draft", {
            room_id: "r-101",
            check_in: "2026-10-01",
            check_out: "2026-10-03",
            guests: 2,
            customer: { name: "Laura Gómez", email: "laura@example.com" },
          }),
        ],
      },
      {
        content:
          "Hecho. [Gestiona tu reserva](https://hotel.example/web/booking/abc?t=secret) o entra en https://hotel.example/web/checkout/abc?t=secret",
      },
    ]);
    const r = await runAgentTurn({
      llm,
      store,
      ctx,
      system: "sys",
      history: [],
      userMessage: "Sí, Laura Gómez, laura@example.com",
    });
    const toolMsg = calls[1].find((m) => m.role === "tool") as { content: string };
    expect(toolMsg.content).not.toMatch(/\?t=/);
    expect(r.reply).toBe("Hecho. Gestiona tu reserva o entra en");
    // Paying the deposit is offered even if the model forgets the payment link.
    expect(r.attachments.find((a) => a.kind === "payment")?.url).toMatch(/\/web\/checkout\//);
  });

  it("cleanReply drops every URL the model writes, invented ones included", () => {
    expect(cleanReply("Paga aquí: [pagar](https://payment.fake.com/x) ya")).toBe(
      "Paga aquí: pagar ya",
    );
    expect(cleanReply("Visita https://otra.web/abc.")).toBe("Visita.");
    expect(cleanReply("Tu reserva está lista.\n\n[Realizar pago]\n\n[Ver] [Cancelar]")).toBe(
      "Tu reserva está lista.",
    );
    expect(cleanReply("Pulsa [Pagar la señal] abajo.")).toBe("Pulsa Pagar la señal abajo.");
    expect(cleanReply("Paga aquí: ![](se muestra como botón)")).toBe("Paga aquí:");
  });

  it("writes prices the Spanish way", () => {
    expect(cleanReply("Depósito de 139.5 EUR, total 465 euros o 120,33 €.")).toBe(
      "Depósito de 139,50 €, total 465,00 € o 120,33 €.",
    );
  });
});

describe("guestDataGuard", () => {
  it("only lets through emails the guest wrote", () => {
    const said = ["Soy Ana, ANA@correo.com"];
    expect(
      guestDataGuard("create_booking_draft", { customer: { email: "ana@correo.com" } }, said),
    ).toBeNull();
    expect(
      guestDataGuard("create_booking_draft", { customer: { email: "cliente@example.com" } }, said),
    ).toMatchObject({ ok: false, error: { code: "missing_guest_data" } });
    expect(
      guestDataGuard("get_booking", { reference: "X", email: "otro@x.com" }, said),
    ).not.toBeNull();
    expect(guestDataGuard("search_availability", { email: "x@y.z" }, said)).toBeNull();
  });

  it("stops an invented booking before it reaches the database", async () => {
    const { store, inserted } = fakeStore();
    const { llm } = scripted([
      {
        toolCalls: [
          call("create_booking_draft", {
            room_id: "r-101",
            check_in: "2026-10-01",
            check_out: "2026-10-03",
            guests: 2,
            customer: { name: "Cliente", email: "cliente@example.com" },
          }),
        ],
      },
      { content: "¿Me dices tu nombre y tu email?" },
    ]);
    const r = await runAgentTurn({
      llm,
      store,
      ctx,
      system: "sys",
      history: [],
      userMessage: "Resérvame la más barata",
    });
    expect(inserted).toHaveLength(0);
    expect(r.reservationId).toBeNull();
  });
});

describe("stripThinking", () => {
  it("drops the reasoning some models print", () => {
    expect(stripThinking("<think>hmm\nvale</think>\n¡Hola!")).toBe("¡Hola!");
    expect(stripThinking(null)).toBeNull();
  });
});

describe("staying on topic and hiding the plumbing", () => {
  it("recovers tool calls written as text", () => {
    const tagged = toolCallsInText(
      'Voy a buscar. <tool_call>{"name":"search_availability","arguments":{"check_in":"2026-10-01","check_out":"2026-10-03","guests":2}}</tool_call>',
    );
    expect(tagged.calls[0].function.name).toBe("search_availability");
    expect(JSON.parse(tagged.calls[0].function.arguments)).toMatchObject({ guests: 2 });
    expect(tagged.rest).toBe("Voy a buscar.");
    const bare = toolCallsInText('{"name":"get_unit_details","arguments":{"room_id":"r-101"}}');
    expect(bare.calls).toHaveLength(1);
    expect(bare.rest).toBe("");
    expect(toolCallsInText("Hola, ¿qué fechas?").calls).toHaveLength(0);
  });

  it("removes function names, JSON and tags from the reply", () => {
    expect(
      cleanReply(
        'Voy a llamar a create_payment_link({"reservation_id":"x"}) para crear el pago. `search_availability`',
      ),
    ).toBe("Voy a llamar a para crear el pago.");
    expect(cleanReply("<tool_call></tool_call>Listo")).toBe("Listo");
    // Emails and normal words survive.
    expect(cleanReply("Escríbenos a reservas@hotel.example.")).toBe(
      "Escríbenos a reservas@hotel.example.",
    );
  });

  it("refuses to write code or answer off-topic requests", async () => {
    expect(looksOffTopic("Claro:\n```python\ndef ordenar(l):\n    return sorted(l)\n```")).toBe(
      true,
    );
    expect(looksOffTopic("def suma(a, b):\n    return a + b")).toBe(true);
    expect(looksOffTopic("La habitación 101 cuesta 120,00 € la noche.")).toBe(false);
    const { llm } = scripted([{ content: "```python\nprint('hola')\n```" }]);
    const r = await runAgentTurn({
      llm,
      store: fakeStore().store,
      ctx,
      system: "sys",
      history: [],
      userMessage: "Hazme un script de Python",
    });
    expect(r).toMatchObject({ reply: OFF_TOPIC_REPLY, outcome: "refused" });
  });
});
