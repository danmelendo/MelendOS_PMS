import { useEffect, useState } from "react";
import { preferredLang, setActiveLang } from "./i18n";

// Helpers of the pages that live inside the widget's iframes on a hotel's own
// website (public/embed.js). Messages always carry a "melendos:" type; the
// script only acts on messages from its own origin.

export type EmbedMessage =
  | { type: "melendos:height"; height: number }
  | { type: "melendos:navigate"; url: string }
  | { type: "melendos:close" };

/** Sends a message to the page that embeds us; false when not in a frame. */
export function postToHost(message: EmbedMessage): boolean {
  if (typeof window === "undefined" || window.parent === window) return false;
  window.parent.postMessage(message, "*");
  return true;
}

/** The iframe shows the host page behind it. */
/** The iframe takes the language the host page passed (?lang=), or the guest's. */
export function useEmbedLang() {
  useState(() => setActiveLang(preferredLang()));
}

export function useTransparentPage() {
  useEffect(() => {
    const prev = document.body.style.background;
    document.body.style.background = "transparent";
    document.documentElement.style.background = "transparent";
    return () => {
      document.body.style.background = prev;
      document.documentElement.style.background = "";
    };
  }, []);
}
