import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { DesktopRendererApp } from "./App.tsx";

const root = document.querySelector("#root");

if (!(root instanceof HTMLElement)) {
  throw new Error("Renderer root element was not found.");
}

createRoot(root).render(
  <StrictMode>
    <DesktopRendererApp />
  </StrictMode>,
);
