import { useEffect, useMemo, useState, type FormEvent } from "react";
import { CalendarCheck, CalendarPlus, Check, Clock, Loader2, PhoneCall, Video } from "lucide-react";
import { Layout } from "../components/Layout";
import { BRAND, PAGES, SALES } from "../config";
import { LeadError, fetchSlots, submitLead } from "../lib/api";
import { PLAN_IDS, PLANS, type PlanId } from "../../supabase/functions/_shared/plans.ts";
import { DEMO_MINUTES, DEMO_TIMEZONE, slotDay } from "../../supabase/functions/_shared/slots.ts";

const FIELD =
  "mt-1 block h-10 w-full rounded-md border border-input bg-card px-3 text-sm shadow-sm focus-visible:outline-2 focus-visible:outline-ring";

const dayLabel = (iso: string) =>
  new Date(iso).toLocaleDateString("es-ES", {
    timeZone: DEMO_TIMEZONE,
    weekday: "short",
    day: "numeric",
    month: "short",
  });
const timeLabel = (iso: string, timeZone = DEMO_TIMEZONE) =>
  new Date(iso).toLocaleTimeString("es-ES", { timeZone, hour: "2-digit", minute: "2-digit" });
const fullLabel = (iso: string) =>
  new Date(iso).toLocaleString("es-ES", {
    timeZone: DEMO_TIMEZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });

const localZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

/** Calendar file for the booked call, so it lands in the visitor's calendar. */
function icsHref(slot: string) {
  const fmt = (d: Date) =>
    d
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}/, "");
  const start = new Date(slot);
  const end = new Date(start.getTime() + DEMO_MINUTES * 60_000);
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//${BRAND}//Demo//ES`,
    "BEGIN:VEVENT",
    `UID:${fmt(start)}-${Math.random().toString(36).slice(2)}@demo`,
    `DTSTAMP:${fmt(new Date())}`,
    `DTSTART:${fmt(start)}`,
    `DTEND:${fmt(end)}`,
    `SUMMARY:Demo de ${BRAND}`,
    "DESCRIPTION:Te enviaremos el enlace de la videollamada por email.",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`;
}

function initial() {
  const q = new URLSearchParams(location.search);
  const plan = q.get("plan");
  return {
    plan: (PLAN_IDS as readonly string[]).includes(plan ?? "") ? (plan as PlanId) : "",
    rooms: q.get("rooms") ?? "",
    hotels: q.get("hotels") ?? "1",
  };
}

type Done = { kind: "demo" | "contact"; slot: string | null; email: string };

export function DemoPage() {
  const [slots, setSlots] = useState<string[] | null>(null);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [slot, setSlot] = useState<string | null>(null);
  const [callMe, setCallMe] = useState(false);
  const [form, setForm] = useState(() => ({
    name: "",
    email: "",
    company: "",
    phone: "",
    message: "",
    website: "",
    privacy: false,
    marketing: false,
    ...initial(),
  }));
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);

  const loadSlots = () => {
    setSlotsError(null);
    fetchSlots()
      .then((s) => {
        setSlots(s);
        setDay((d) => (d && s.some((x) => slotDay(x) === d) ? d : s[0] ? slotDay(s[0]) : null));
      })
      .catch((e: Error) => {
        setSlots([]);
        setSlotsError(e.message);
      });
  };
  useEffect(loadSlots, []);

  const days = useMemo(() => {
    const byDay = new Map<string, string[]>();
    for (const s of slots ?? []) byDay.set(slotDay(s), [...(byDay.get(slotDay(s)) ?? []), s]);
    return [...byDay.entries()];
  }, [slots]);
  const times = days.find(([d]) => d === day)?.[1] ?? [];

  const set = (k: keyof typeof form) => (value: string | boolean) =>
    setForm((f) => ({ ...f, [k]: value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!callMe && !slot) return setError("Elige un día y una hora, o pide que te llamemos.");
    if (!form.privacy) return setError("Necesitamos que aceptes la política de privacidad.");
    setSending(true);
    try {
      const kind = callMe ? "contact" : "demo";
      const res = await submitLead({
        kind,
        slot: callMe ? undefined : (slot ?? undefined),
        name: form.name,
        email: form.email,
        company: form.company,
        phone: form.phone || undefined,
        hotels: Number(form.hotels) || 1,
        rooms: Number(form.rooms) || undefined,
        plan: form.plan || undefined,
        message: form.message || undefined,
        privacy_ok: form.privacy,
        marketing_ok: form.marketing,
        website: form.website,
      });
      setDone({ kind, slot: res.slot, email: form.email });
      window.scrollTo({ top: 0 });
    } catch (err) {
      const e = err as LeadError;
      setError(e.message);
      if (e.status === 409) {
        setSlot(null);
        loadSlots();
      }
    } finally {
      setSending(false);
    }
  };

  if (done)
    return (
      <Layout page="demo">
        <section className="mx-auto max-w-xl px-4 py-16 text-center sm:px-6">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
            <Check className="h-6 w-6" aria-hidden="true" />
          </span>
          {done.slot ? (
            <>
              <h1 className="mt-4 text-2xl font-semibold tracking-tight">¡Demo reservada!</h1>
              <p className="mt-2 text-lg first-letter:uppercase">{fullLabel(done.slot)}</p>
              <p className="text-sm text-muted-foreground">
                Hora de Madrid · {DEMO_MINUTES} minutos
              </p>
              <p className="mt-4 text-muted-foreground">
                Te enviaremos el enlace de la videollamada a <b>{done.email}</b>. Si necesitas
                cambiar la hora, responde a ese email.
              </p>
              <a
                href={icsHref(done.slot)}
                download="demo.ics"
                className="mt-6 inline-flex items-center gap-2 rounded-md border bg-card px-4 py-2.5 text-sm font-semibold hover:bg-accent"
              >
                <CalendarPlus className="h-4 w-4" aria-hidden="true" /> Añadir a mi calendario
              </a>
            </>
          ) : (
            <>
              <h1 className="mt-4 text-2xl font-semibold tracking-tight">¡Recibido!</h1>
              <p className="mt-4 text-muted-foreground">
                Te escribimos a <b>{done.email}</b> en un día laborable para buscar el mejor
                momento.
              </p>
            </>
          )}
          <p className="mt-8">
            <a
              href={PAGES.pricing}
              className="text-sm font-medium text-info-foreground hover:underline"
            >
              Mientras tanto, calcula tu precio →
            </a>
          </p>
        </section>
      </Layout>
    );

  return (
    <Layout page="demo">
      <section className="bg-navy text-navy-foreground">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
          <p className="text-sm font-semibold text-navy-gold">Demo gratuita</p>
          <h1 className="mt-2 max-w-3xl text-3xl font-semibold tracking-tight text-balance text-navy-strong sm:text-4xl">
            Te lo enseñamos con tu hotel en mente
          </h1>
          <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm text-navy-foreground/75">
            <li className="flex items-center gap-1.5">
              <Clock className="h-4 w-4 text-navy-gold" aria-hidden="true" /> {DEMO_MINUTES} minutos
            </li>
            <li className="flex items-center gap-1.5">
              <Video className="h-4 w-4 text-navy-gold" aria-hidden="true" /> Por videollamada
            </li>
            <li className="flex items-center gap-1.5">
              <Check className="h-4 w-4 text-navy-gold" aria-hidden="true" /> Sin compromiso
            </li>
          </ul>
        </div>
      </section>

      <form
        onSubmit={submit}
        className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[1.1fr_1fr]"
        noValidate
      >
        {/* 1. When */}
        <fieldset className="min-w-0 rounded-xl border bg-card p-5">
          <legend className="sr-only">Día y hora</legend>
          <p className="font-semibold">1. Elige día y hora</p>
          <p className="text-xs text-muted-foreground">
            Hora de Madrid
            {localZone !== DEMO_TIMEZONE && " · entre paréntesis, tu hora local"}
          </p>

          {slots === null ? (
            <p className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Buscando horas libres…
            </p>
          ) : slotsError ? (
            <p className="mt-6 text-sm text-muted-foreground">
              No hemos podido cargar la agenda ({slotsError}). Déjanos tus datos y te llamamos
              {SALES.email && (
                <>
                  , o escríbenos a{" "}
                  <a className="text-info-foreground underline" href={`mailto:${SALES.email}`}>
                    {SALES.email}
                  </a>
                </>
              )}
              .
            </p>
          ) : days.length === 0 ? (
            <p className="mt-6 text-sm text-muted-foreground">
              No quedan horas libres estas semanas. Déjanos tus datos y te llamamos.
            </p>
          ) : (
            <div className={callMe ? "pointer-events-none opacity-40" : ""} aria-disabled={callMe}>
              <div
                className="no-scrollbar -mx-1 mt-4 flex gap-2 overflow-x-auto px-1 pb-1"
                role="radiogroup"
                aria-label="Día"
              >
                {days.map(([d, list]) => (
                  <button
                    key={d}
                    type="button"
                    role="radio"
                    aria-checked={d === day}
                    onClick={() => {
                      setDay(d);
                      setSlot(null);
                    }}
                    className={`shrink-0 rounded-md border px-3 py-2 text-center text-sm capitalize transition-colors ${
                      d === day
                        ? "border-primary bg-primary text-primary-foreground"
                        : "bg-background hover:border-info"
                    }`}
                  >
                    {dayLabel(list[0])}
                    <span
                      className={`block text-[11px] normal-case ${d === day ? "text-primary-foreground/70" : "text-muted-foreground"}`}
                    >
                      {list.length} {list.length === 1 ? "hora" : "horas"}
                    </span>
                  </button>
                ))}
              </div>
              <div
                className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3"
                role="radiogroup"
                aria-label="Hora"
              >
                {times.map((t) => (
                  <button
                    key={t}
                    type="button"
                    role="radio"
                    aria-checked={t === slot}
                    onClick={() => setSlot(t)}
                    className={`rounded-md border px-3 py-2 text-sm tabular-nums transition-colors ${
                      t === slot
                        ? "border-primary bg-secondary font-semibold text-secondary-foreground"
                        : "bg-background hover:border-info"
                    }`}
                  >
                    {timeLabel(t)}
                    {localZone !== DEMO_TIMEZONE && (
                      <span className="text-xs text-muted-foreground">
                        {" "}
                        ({timeLabel(t, localZone)})
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          <label className="mt-6 flex items-start gap-2.5 rounded-md bg-muted p-3 text-sm">
            <input
              type="checkbox"
              checked={callMe}
              onChange={(e) => {
                setCallMe(e.target.checked);
                if (e.target.checked) setSlot(null);
              }}
              className="mt-0.5 h-4 w-4 accent-[var(--primary)]"
            />
            <span>
              <span className="flex items-center gap-1.5 font-medium">
                <PhoneCall className="h-4 w-4" aria-hidden="true" /> Ninguna hora me va
              </span>
              <span className="text-muted-foreground">
                Contactadme y buscamos el momento juntos.
              </span>
            </span>
          </label>
        </fieldset>

        {/* 2. Who */}
        <fieldset className="min-w-0 rounded-xl border bg-card p-5">
          <legend className="sr-only">Tus datos</legend>
          <p className="font-semibold">2. Cuéntanos quién eres</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium">
              Nombre
              <input
                required
                autoComplete="name"
                value={form.name}
                onChange={(e) => set("name")(e.target.value)}
                className={FIELD}
              />
            </label>
            <label className="text-sm font-medium">
              Email de trabajo
              <input
                required
                type="email"
                autoComplete="email"
                value={form.email}
                onChange={(e) => set("email")(e.target.value)}
                className={FIELD}
              />
            </label>
            <label className="text-sm font-medium">
              Hotel o grupo
              <input
                required
                autoComplete="organization"
                value={form.company}
                onChange={(e) => set("company")(e.target.value)}
                className={FIELD}
              />
            </label>
            <label className="text-sm font-medium">
              Teléfono <span className="font-normal text-muted-foreground">(opcional)</span>
              <input
                type="tel"
                autoComplete="tel"
                value={form.phone}
                onChange={(e) => set("phone")(e.target.value)}
                className={FIELD}
              />
            </label>
            <label className="text-sm font-medium">
              Hoteles
              <input
                type="number"
                min={1}
                max={500}
                value={form.hotels}
                onChange={(e) => set("hotels")(e.target.value)}
                className={FIELD}
              />
            </label>
            <label className="text-sm font-medium">
              Habitaciones en total
              <input
                type="number"
                min={1}
                max={20000}
                value={form.rooms}
                onChange={(e) => set("rooms")(e.target.value)}
                className={FIELD}
              />
            </label>
            <label className="text-sm font-medium sm:col-span-2">
              Plan que te interesa
              <select
                value={form.plan}
                onChange={(e) => set("plan")(e.target.value)}
                className={FIELD}
              >
                <option value="">Aún no lo sé</option>
                {PLAN_IDS.map((id) => (
                  <option key={id} value={id}>
                    {PLANS[id].name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-medium sm:col-span-2">
              ¿Qué te gustaría ver?{" "}
              <span className="font-normal text-muted-foreground">(opcional)</span>
              <textarea
                rows={3}
                maxLength={2000}
                value={form.message}
                onChange={(e) => set("message")(e.target.value)}
                className={`${FIELD} h-auto py-2`}
                placeholder="Por ejemplo: cómo conectar Booking.com o cómo funciona el check-in online"
              />
            </label>
            {/* Honeypot: hidden from people, bots fill it. */}
            <label className="absolute -left-[9999px]" aria-hidden="true">
              Web
              <input
                tabIndex={-1}
                autoComplete="off"
                value={form.website}
                onChange={(e) => set("website")(e.target.value)}
              />
            </label>
          </div>

          <div className="mt-5 space-y-2 text-sm">
            <label className="flex items-start gap-2.5">
              <input
                type="checkbox"
                required
                checked={form.privacy}
                onChange={(e) => set("privacy")(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-[var(--primary)]"
              />
              <span>
                He leído la{" "}
                <a href={PAGES.privacy} target="_blank" className="text-info-foreground underline">
                  política de privacidad
                </a>{" "}
                y acepto que usen mis datos para organizar la demo.
              </span>
            </label>
            <label className="flex items-start gap-2.5 text-muted-foreground">
              <input
                type="checkbox"
                checked={form.marketing}
                onChange={(e) => set("marketing")(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-[var(--primary)]"
              />
              <span>Quiero recibir novedades del producto (como mucho, una vez al mes).</span>
            </label>
          </div>

          {error && (
            <p
              role="alert"
              className="mt-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={sending}
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow hover:bg-primary/90 disabled:opacity-60"
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <CalendarCheck className="h-4 w-4" aria-hidden="true" />
            )}
            {callMe
              ? "Quiero que me contactéis"
              : slot
                ? `Reservar ${dayLabel(slot)} a las ${timeLabel(slot)}`
                : "Reservar demo"}
          </button>
        </fieldset>
      </form>
    </Layout>
  );
}
