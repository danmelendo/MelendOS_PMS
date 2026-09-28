import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ArrowRight, CalendarPlus, Clock, Loader2, PhoneCall, Video } from "lucide-react";
import { Layout } from "../components/Layout";
import { HeroPhoto } from "../components/HeroPhoto";
import { Marker, Tick } from "../components/ui";
import { PAGES, SALES } from "../config";
import { LeadError, fetchSlots, submitLead } from "../lib/api";
import { PLAN_IDS, PLANS, type PlanId } from "../../supabase/functions/_shared/plans.ts";
import { DEMO_MINUTES, DEMO_TIMEZONE, slotDay } from "../../supabase/functions/_shared/slots.ts";
import { demoIcs } from "../../supabase/functions/_shared/lead-email.ts";

const FIELD =
  "mt-1.5 block h-11 w-full rounded-lg border border-input bg-card px-3 text-sm font-normal shadow-[var(--shadow-rest)] focus-visible:outline-2 focus-visible:outline-ring";

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

/** Calendar file for the booked call, so it lands in the visitor's calendar. */
function icsHref(slot: string, id: string) {
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(demoIcs(slot, id, DEMO_MINUTES))}`;
}

/** Plan and size passed from the pricing page (?plan=pro&rooms=40&hotels=1). */
function fromQuery(): { plan: PlanId | ""; rooms: string; hotels: string } {
  const q = new URLSearchParams(window.location.search);
  const plan = q.get("plan");
  return {
    plan: (PLAN_IDS as readonly string[]).includes(plan ?? "") ? (plan as PlanId) : "",
    rooms: q.get("rooms") ?? "",
    hotels: q.get("hotels") ?? "1",
  };
}

type Done = {
  id: string;
  kind: "demo" | "contact";
  slot: string | null;
  email: string;
  confirmation: boolean;
};

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
    plan: "" as PlanId | "",
    rooms: "",
    hotels: "1",
  }));
  // Browser-only values are read after mounting, so the prerendered HTML and
  // the first render in the browser match.
  const [localZone, setLocalZone] = useState(DEMO_TIMEZONE);
  useEffect(() => {
    setLocalZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
    setForm((f) => ({ ...f, ...fromQuery() }));
  }, []);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);

  const loadSlots = () => {
    setSlotsError(null);
    fetchSlots()
      .then((s) => {
        setSlots(s);
        // A time chosen on another page (?slot=...) comes selected, if still free.
        const wanted = new URLSearchParams(window.location.search).get("slot");
        const at = wanted ? new Date(wanted) : null;
        const hit =
          at && !Number.isNaN(at.getTime()) ? s.find((x) => x === at.toISOString()) : undefined;
        if (hit) {
          setDay(slotDay(hit));
          setSlot(hit);
          return;
        }
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
      setDone({
        id: res.id,
        kind,
        slot: res.slot,
        email: form.email,
        confirmation: res.confirmation === true,
      });
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
        <section className="mx-auto max-w-xl px-4 py-24 text-center sm:px-6">
          <span className="rise mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-mineral-soft">
            <Tick className="h-7 w-7" />
          </span>
          {done.slot ? (
            <>
              <h1 className="font-display rise mt-6 text-[2.8rem] [--d:80ms]">¡Demo reservada!</h1>
              <p className="font-figure mt-3 text-lg first-letter:uppercase">
                {fullLabel(done.slot)}
              </p>
              <p className="text-sm text-stone">Hora de Madrid · {DEMO_MINUTES} minutos</p>
              <p className="mt-5 leading-relaxed text-stone">
                {done.confirmation ? "Te hemos enviado la confirmación a " : "Te escribiremos a "}
                <b>{done.email}</b> con el enlace de la videollamada antes de la cita. Si necesitas
                cambiar la hora, responde a ese email.
              </p>
              <a
                href={icsHref(done.slot, done.id)}
                download="demo.ics"
                className="btn btn-quiet mt-8"
              >
                <CalendarPlus className="h-4 w-4" aria-hidden="true" /> Añadir a mi calendario
              </a>
            </>
          ) : (
            <>
              <h1 className="font-display rise mt-6 text-[2.8rem] [--d:80ms]">¡Recibido!</h1>
              <p className="mt-5 leading-relaxed text-stone">
                Te escribimos a <b>{done.email}</b> en un día laborable para buscar el mejor
                momento.
              </p>
            </>
          )}
          <p className="mt-10">
            <a
              href={PAGES.pricing}
              className="link-draw lean inline-flex items-center gap-1.5 text-sm font-semibold text-brass-deep"
            >
              Mientras tanto, calcula tu precio{" "}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </a>
          </p>
        </section>
      </Layout>
    );

  return (
    <Layout page="demo">
      <section className="lamp relative overflow-hidden bg-night text-navy-foreground">
        <HeroPhoto />
        <div className="relative mx-auto max-w-7xl px-4 pt-14 pb-24 sm:px-6 lg:px-8">
          <div className="rise">
            <Marker n="Demo" onNight>
              Gratuita
            </Marker>
          </div>
          <h1 className="font-display rise mt-5 max-w-3xl text-[2.8rem] text-balance text-navy-strong [--d:80ms] sm:text-[3.8rem]">
            Te lo enseñamos con <em className="text-brass">tu hotel</em> en mente
          </h1>
          <ul className="rise mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-navy-foreground/75 [--d:160ms]">
            <li className="flex items-center gap-1.5">
              <Clock className="h-4 w-4 text-brass" aria-hidden="true" /> {DEMO_MINUTES} minutos
            </li>
            <li className="flex items-center gap-1.5">
              <Video className="h-4 w-4 text-brass" aria-hidden="true" /> Por videollamada
            </li>
            <li className="flex items-center gap-1.5">
              <Tick className="!text-brass" /> Sin compromiso
            </li>
          </ul>
        </div>
      </section>

      <form
        onSubmit={submit}
        className="relative mx-auto -mt-12 grid max-w-7xl gap-6 px-4 pb-24 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:px-8"
        noValidate
      >
        {/* 1. When */}
        <fieldset className="surface-lift min-w-0 self-start rounded-2xl p-6">
          <legend className="sr-only">Día y hora</legend>
          <p className="flex items-baseline gap-3">
            <span className="font-figure text-sm text-brass-deep">01</span>
            <span className="font-display text-[1.7rem]">Elige día y hora</span>
          </p>
          <p className="text-xs text-stone">
            Hora de Madrid
            {localZone !== DEMO_TIMEZONE && " · entre paréntesis, tu hora local"}
          </p>

          {slots === null ? (
            <p className="mt-6 flex items-center gap-2 text-sm text-stone">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Buscando horas libres…
            </p>
          ) : slotsError ? (
            <p className="mt-6 text-sm text-stone">
              No hemos podido cargar la agenda ({slotsError}). Déjanos tus datos y te llamamos
              {SALES.email && (
                <>
                  , o escríbenos a{" "}
                  <a
                    className="font-medium text-brass-deep underline underline-offset-2"
                    href={`mailto:${SALES.email}`}
                  >
                    {SALES.email}
                  </a>
                </>
              )}
              .
            </p>
          ) : days.length === 0 ? (
            <p className="mt-6 text-sm text-stone">
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
                    className={`shrink-0 rounded-xl border px-3.5 py-2.5 text-center text-sm capitalize transition-colors ${
                      d === day
                        ? "border-night bg-night text-navy-strong"
                        : "bg-card hover:border-brass-deep/50"
                    }`}
                  >
                    {dayLabel(list[0])}
                    <span
                      className={`font-figure block text-[11px] normal-case ${d === day ? "text-brass" : "text-stone"}`}
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
                    className={`font-figure rounded-xl border px-3 py-2.5 text-sm transition-colors active:scale-[0.97] ${
                      t === slot
                        ? "border-brass bg-brass font-semibold text-night"
                        : "bg-card hover:border-brass-deep/50"
                    }`}
                  >
                    {timeLabel(t)}
                    {localZone !== DEMO_TIMEZONE && (
                      <span className="text-xs text-stone"> ({timeLabel(t, localZone)})</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          <label className="mt-6 flex cursor-pointer items-start gap-2.5 rounded-xl bg-muted p-3.5 text-sm">
            <input
              type="checkbox"
              checked={callMe}
              onChange={(e) => {
                setCallMe(e.target.checked);
                if (e.target.checked) setSlot(null);
              }}
              className="mt-0.5 h-4 w-4 accent-[var(--brass-deep)]"
            />
            <span>
              <span className="flex items-center gap-1.5 font-medium">
                <PhoneCall className="h-4 w-4" aria-hidden="true" /> Ninguna hora me va
              </span>
              <span className="text-stone">Contactadme y buscamos el momento juntos.</span>
            </span>
          </label>
        </fieldset>

        {/* 2. Who */}
        <fieldset className="surface-lift min-w-0 self-start rounded-2xl p-6">
          <legend className="sr-only">Tus datos</legend>
          <p className="flex items-baseline gap-3">
            <span className="font-figure text-sm text-brass-deep">02</span>
            <span className="font-display text-[1.7rem]">Cuéntanos quién eres</span>
          </p>
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
              Teléfono <span className="font-normal text-stone">(opcional)</span>
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
              ¿Qué te gustaría ver? <span className="font-normal text-stone">(opcional)</span>
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
                className="mt-0.5 h-4 w-4 accent-[var(--brass-deep)]"
              />
              <span>
                He leído la{" "}
                <a
                  href={PAGES.privacy}
                  target="_blank"
                  className="font-medium text-brass-deep underline underline-offset-2"
                >
                  política de privacidad
                </a>{" "}
                y acepto que usen mis datos para organizar la demo.
              </span>
            </label>
            <label className="flex items-start gap-2.5 text-stone">
              <input
                type="checkbox"
                checked={form.marketing}
                onChange={(e) => set("marketing")(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-[var(--brass-deep)]"
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
            className="btn btn-brass lean mt-6 w-full !py-3.5 disabled:opacity-60"
          >
            {sending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {callMe
              ? "Quiero que me contactéis"
              : slot
                ? `Reservar ${dayLabel(slot)} a las ${timeLabel(slot)}`
                : "Reservar demo"}
            {!sending && <ArrowRight aria-hidden="true" />}
          </button>
        </fieldset>
      </form>
    </Layout>
  );
}
