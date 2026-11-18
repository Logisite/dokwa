import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
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
    <App />
  </StrictMode>,
);
