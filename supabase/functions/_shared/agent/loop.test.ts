import { describe, expect, it } from "vitest";
import { fakeStore } from "../tools/testing.ts";
import type { ToolContext } from "../tools/registry.ts";
import type { ChatMessage, LlmClient, LlmResponse, ToolSpec } from "./llm.ts";
import { stripThinking, toolCallsInText } from "./llm.ts";
import {
  cleanReply,
  falseClaim,
  guestDataGuard,
  looksOffTopic,
  MAX_STEPS,
  OFF_TOPIC_REPLY,
  runAgentTurn,
  toolSpecs,
  cancellationGuard,
  recoveryGuard,
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
    expect(r.attachments[1]).toMatchObject({ kind: "payment" });
    const pay = r.attachments[1] as { url: string; label: string };
    expect(pay.url).toMatch(/^https:\/\/hotel\.example\/web\/checkout\//);
    expect(pay.label).toBe("Pagar la reserva (200,00 €)");
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
    expect(specs).toHaveLength(9);
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
    expect(
      (r.attachments.find((a) => a.kind === "payment") as { url?: string } | undefined)?.url,
    ).toMatch(/\/web\/checkout\//);
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

describe("claims without actions", () => {
  it("spots a booking or cancellation that was only said, not done", () => {
    const none = () => false;
    expect(falseClaim("Perfecto, he reservado la habitación 104.", none)).toMatch(/NO existe/);
    expect(falseClaim("¡Reserva creada! Te espero.", none)).toMatch(/create_booking_draft/);
    expect(falseClaim("He solicitado la cancelación al hotel.", none)).toMatch(/cancel_booking/);
    expect(falseClaim("Listo, he cancelado tu reserva.", none)).toMatch(/NO se ha cancelado/);
    expect(falseClaim("He cancelado tu reserva.", (t) => t === "cancel_booking")).toBeNull();
    expect(
      falseClaim("He reservado la habitación.", (t) => t === "create_booking_draft"),
    ).toBeNull();
    expect(falseClaim("La 104 está libre por 255,00 €.", none)).toBeNull();
  });

  it("makes the model act instead of pretending, without showing the note", async () => {
    const { store, inserted } = fakeStore();
    const { llm, calls } = scripted([
      { content: "Perfecto, he reservado la habitación 101 para ti." },
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
      { content: "Listo, reserva pendiente de pago." },
    ]);
    const r = await runAgentTurn({
      llm,
      store,
      ctx,
      system: "sys",
      history: [],
      userMessage: "La 101, pago online. Laura Gómez, laura@example.com",
    });
    expect(inserted).toHaveLength(1);
    expect(r.outcome).toBe("booking_draft");
    expect(r.reply).toBe("Listo, reserva pendiente de pago.");
    // The note reached the model once and is not stored.
    expect(
      calls[1].some((m) => m.role === "user" && String(m.content).includes("Nota del sistema")),
    ).toBe(true);
    expect(
      r.messages.some((m) =>
        String((m as { content?: unknown }).content).includes("Nota del sistema"),
      ),
    ).toBe(false);
  });

  it("never shows a false claim twice", async () => {
    const { llm } = scripted([{ content: "He reservado la 101." }]);
    const r = await runAgentTurn({
      llm,
      store: fakeStore().store,
      ctx,
      system: "sys",
      history: [],
      userMessage: "Resérvala",
    });
    expect(r.reply).not.toMatch(/He reservado/);
    expect(r.reservationId).toBeNull();
  });
});

describe("cancellation confirmed by the guest", () => {
  const terms = (reference: string) => ({
    role: "tool" as const,
    name: "cancel_booking",
    tool_call_id: "c1",
    content: JSON.stringify({ ok: true, data: { status: "needs_confirmation", reference } }),
  });
  const args = { reference: "b2000000", email: "laura@example.com", check_in: "2026-10-01" };

  it("refuses to cancel before the terms were shown in an earlier turn", () => {
    expect(cancellationGuard("cancel_booking", { ...args, confirm: false }, [])).toBeNull();
    expect(cancellationGuard("cancel_booking", { ...args, confirm: true }, [])).toMatchObject({
      ok: false,
      error: { code: "confirmation_required" },
    });
    expect(
      cancellationGuard("cancel_booking", { ...args, confirm: true }, [terms("B9999999")]),
    ).toMatchObject({ ok: false });
    expect(
      cancellationGuard("cancel_booking", { ...args, confirm: true }, [terms("B2000000")]),
    ).toBeNull();
    expect(cancellationGuard("get_booking", { ...args, confirm: true }, [])).toBeNull();
  });
});

describe("rich chat", () => {
  it("turns a search into room cards with photos the model never sees", async () => {
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
      { content: "Tienes tres opciones debajo." },
      { toolCalls: [call("list_extras", {})] },
      { content: "Estos son los extras." },
    ]);
    const r = await runAgentTurn({
      llm,
      store: fakeStore().store,
      ctx,
      system: "sys",
      history: [],
      userMessage: "Habitación para 2 del 1 al 3 de octubre",
    });
    const cards = r.attachments.find((a) => a.kind === "rooms") as {
      search: object;
      rooms: { room: string; image_url: string | null; price_total: number }[];
    };
    expect(cards.search).toEqual({ check_in: "2026-10-01", check_out: "2026-10-03", guests: 2 });
    expect(cards.rooms.map((x) => x.room)).toEqual(["102", "101", "201"]);
    expect(cards.rooms[0]).toMatchObject({
      image_url: "/imagenes/rooms/test.svg",
      price_total: 160,
    });
    const toolMessage = calls[1].find((m) => m.role === "tool");
    expect(String(toolMessage?.content)).not.toContain("image_url");

    const extras = await runAgentTurn({
      llm: scripted([{ toolCalls: [call("list_extras", {})] }, { content: "Mira los extras." }])
        .llm,
      store: fakeStore().store,
      ctx,
      system: "sys",
      history: [],
      userMessage: "¿Qué extras tenéis?",
    });
    expect(extras.attachments).toEqual([
      {
        kind: "extras",
        extras: [
          { extra_id: "x-breakfast", name: "Desayuno buffet", price: 18 },
          { extra_id: "x-parking", name: "Parking", price: 22 },
        ],
      },
    ]);
  });

  it("limits the attempts to recover a lost reference", () => {
    const attempt = {
      role: "tool" as const,
      name: "recover_booking",
      tool_call_id: "r",
      content: "{}",
    };
    expect(recoveryGuard("recover_booking", [attempt, attempt])).toBeNull();
    expect(recoveryGuard("recover_booking", [attempt, attempt, attempt])).toMatchObject({
      error: { code: "too_many_attempts" },
    });
    expect(recoveryGuard("get_booking", [attempt, attempt, attempt])).toBeNull();
  });
});

describe("extras are not invented", () => {
  it("sends the model to list_extras when it prices extras on its own", () => {
    const none = () => false;
    expect(falseClaim("Tenemos:\n- Desayuno: 12,50 € por persona", none)).toMatch(/list_extras/);
    expect(
      falseClaim("¿Quieres añadir desayuno o parking?\nLa 104 cuesta 255,00 €.", none),
    ).toBeNull();
    expect(falseClaim("- Desayuno buffet: 18,00 €", (t) => t === "list_extras")).toBeNull();
  });
});
