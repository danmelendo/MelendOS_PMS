import { StrictMode, type ReactNode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { LazyMotion, MotionConfig, domAnimation } from "motion/react";
import { rememberAttribution } from "./lib/api";
import "./styles.css";

/** Mounts a page into #root; hydrates it when the build prerendered its HTML. */
export function mount(page: ReactNode) {
  rememberAttribution();
  const root = document.getElementById("root")!;
  // Motion honours "reduce motion"; only the small DOM feature set is loaded.
  const tree = (
    <StrictMode>
      <LazyMotion features={domAnimation} strict>
        <MotionConfig reducedMotion="user">{page}</MotionConfig>
      </LazyMotion>
    </StrictMode>
  );
  if (root.hasChildNodes()) hydrateRoot(root, tree);
  else createRoot(root).render(tree);
  revealOnScroll();
  spotlight();
}

/** Adds .is-in to [data-reveal] elements as they come into view (once). */
function revealOnScroll() {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const show = (el: Element) => el.classList.add("is-in");
  if (reduced || !("IntersectionObserver" in window)) {
    document.querySelectorAll("[data-reveal]").forEach(show);
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        show(e.target);
        io.unobserve(e.target);
      }
    },
    { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
  );
  const watch = () =>
    document.querySelectorAll("[data-reveal]:not(.is-in)").forEach((el) => io.observe(el));
  watch();
  // Content rendered later (tabs, fetched data) gets observed too.
  new MutationObserver(watch).observe(document.body, { childList: true, subtree: true });
}

/** Cards with [data-spotlight] light up where the cursor is (mouse only). */
function spotlight() {
  if (!matchMedia("(hover: hover) and (pointer: fine)").matches) return;
  document.addEventListener(
    "pointermove",
    (e) => {
      const el = (e.target as Element | null)?.closest<HTMLElement>("[data-spotlight]");
      if (!el) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty("--mx", `${e.clientX - r.left}px`);
      el.style.setProperty("--my", `${e.clientY - r.top}px`);
    },
    { passive: true },
  );
}
