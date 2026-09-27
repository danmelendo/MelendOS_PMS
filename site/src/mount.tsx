import { StrictMode, type ReactNode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { rememberAttribution } from "./lib/api";
import "./styles.css";

/** Mounts a page into #root; hydrates it when the build prerendered its HTML. */
export function mount(page: ReactNode) {
  rememberAttribution();
  const root = document.getElementById("root")!;
  const tree = <StrictMode>{page}</StrictMode>;
  if (root.hasChildNodes()) hydrateRoot(root, tree);
  else createRoot(root).render(tree);
}
