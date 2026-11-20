import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { Theme } from "@astryxdesign/core/theme";
import { registerSW } from "virtual:pwa-register";
import "@astryxdesign/core/reset.css";
import "@astryxdesign/core/astryx.css";
import { defaultThemeSlug, themes } from "./astryx-themes.ts";
import App from "./App.jsx";
import "./app.css";

/**
 * `prompt`, not `autoUpdate`: a till tab that reloads itself mid-session can
 * lose an unflushed write. The prompt lives in App's UpdatePrompt.
 */
const root = document.getElementById("root");
if (!root) throw new Error("dokwa: index.html has no #root");

// Register at startup, before the UI mounts. UpdatePrompt only renders the
// prompt; a reload must not be the thing that installs the worker.
registerSW({
  immediate: true,
  onRegistered: (registration) =>
    console.info("dokwa: service worker ready", registration?.scope),
  onRegisterError: (error) =>
    console.error("dokwa: service worker failed", String(error)),
});

createRoot(root).render(
  <StrictMode>
    <Theme theme={themes[defaultThemeSlug]}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </Theme>
  </StrictMode>,
);
