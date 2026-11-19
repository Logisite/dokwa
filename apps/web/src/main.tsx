import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import { Theme } from "@astryxdesign/core/theme";
import "@astryxdesign/core/reset.css";
import "@astryxdesign/core/astryx.css";
import { defaultThemeSlug, themes } from "./astryx-themes.ts";
import App from "./App.jsx";
import "./app.css";

/**
 * `prompt`, not `autoUpdate`: a till tab that reloads itself mid-session can
 * lose an unflushed write. The interface asks; the interface never guesses.
 */
registerSW({ immediate: true });

const root = document.getElementById("root");
if (!root) throw new Error("dokwa: index.html has no #root");

createRoot(root).render(
  <StrictMode>
    <Theme theme={themes[defaultThemeSlug]}>
      <App />
    </Theme>
  </StrictMode>,
);
