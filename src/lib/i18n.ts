import { useSyncExternalStore } from "react";
import { EN } from "./i18n-en";
import { PANEL_EN } from "./i18n-panel-en";

// Languages of the guest web ("Mi reserva", widget, emails) and of the
// management panel. The Spanish text is the key: t("Mi reserva") gives the
// English from i18n-en.ts (guest) or i18n-panel-en.ts (panel), or the Spanish
// itself if there is no translation yet, so a missing entry never breaks a
// page.
//
// The guest's choice: ?lang=en|es, then what they chose before (this
// browser), then the browser's language (Spanish if it is Spanish, English
// otherwise).

export type Lang = "es" | "en";
export const LANGS: Record<Lang, string> = { es: "Español", en: "English" };

const KEY = "melendos-lang";
const PANEL_KEY = "melendos-panel-lang";
const DICT: Record<string, string> = { ...PANEL_EN, ...EN };
let active: Lang = "es";
const listeners = new Set<() => void>();

function stored(): Lang | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === "es" || v === "en" ? v : null;
  } catch {
    return null;
  }
}

/** The guest's language for the booking web. */
export function preferredLang(): Lang {
  if (typeof window === "undefined") return "es";
  const param = new URLSearchParams(window.location.search).get("lang");
  if (param === "es" || param === "en") {
    try {
      localStorage.setItem(KEY, param);
    } catch {
      /* private mode */
    }
    return param;
  }
  const saved = stored();
  if (saved) return saved;
  return (navigator.language || "es").toLowerCase().startsWith("es") ? "es" : "en";
}

/**
 * The panel's language: what this person chose in the panel (this browser),
 * Spanish by default. Separate from the guest web's choice.
 */
export function panelLang(): Lang {
  try {
    const v = localStorage.getItem(PANEL_KEY);
    return v === "en" ? "en" : "es";
  } catch {
    return "es";
  }
}

export function setPanelLang(lang: Lang) {
  try {
    localStorage.setItem(PANEL_KEY, lang);
  } catch {
    /* private mode */
  }
  setActiveLang(lang);
}

/** Language in use now (the web sets the guest's; the panel, the staff member's). */
export function setActiveLang(lang: Lang, remember = false) {
  if (remember) {
    try {
      localStorage.setItem(KEY, lang);
    } catch {
      /* private mode */
    }
  }
  if (lang === active) return;
  active = lang;
  if (typeof document !== "undefined") document.documentElement.lang = lang;
  listeners.forEach((l) => l());
}

export function currentLang(): Lang {
  return active;
}

/** Locale for dates and amounts in the active language. */
export function currentLocale(): string {
  return active === "en" ? "en-GB" : "es-ES";
}

/** Translates a Spanish text ({name} placeholders filled from vars). */
export function t(es: string, vars?: Record<string, string | number>): string {
  const text = active === "en" ? (DICT[es] ?? es) : es;
  return vars ? text.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : text;
}

/** Plural helper: tn(n, "noche", "noches"). */
export function tn(n: number, one: string, many: string): string {
  return t(n === 1 ? one : many);
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Re-renders the component when the language changes. */
export function useLang(): { lang: Lang; t: typeof t; tn: typeof tn; locale: string } {
  const lang = useSyncExternalStore(subscribe, currentLang, () => "es" as Lang);
  return { lang, t, tn, locale: lang === "en" ? "en-GB" : "es-ES" };
}
