import { StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { rememberAttribution } from "./lib/api";
import "./styles.css";

/** Mounts a page into #root (one HTML file per page). */
export function mount(page: ReactNode) {
  rememberAttribution();
  createRoot(document.getElementById("root")!).render(<StrictMode>{page}</StrictMode>);
}
