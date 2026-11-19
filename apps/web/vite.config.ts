import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import wasm from "vite-plugin-wasm";
import { VitePWA } from "vite-plugin-pwa";

/**
 * The origin is where the storage lives, so the port is pinned per checkout
 * and never left to "in use, trying the next one". One config, no per-branch
 * edits: the worktree name picks the port, and DOKWA_PORT overrides it.
 *
 *   5173 main   5174 crypto   5175 wires   5176 room
 *
 * `strictPort` means a clash fails loudly instead of silently moving a live
 * test onto another tree's data.
 */
function port(): number {
  const override = Number(process.env["DOKWA_PORT"]);
  if (Number.isInteger(override) && override > 0) return override;

  const parts = process.cwd().split(/[\\/]/);
  const checkout = parts[parts.indexOf("dokwa-wt") + 1];
  switch (checkout) {
    case "crypto":
      return 5174;
    case "wires":
      return 5175;
    case "room":
      return 5176;
    default:
      return 5173;
  }
}

export default defineConfig({
  plugins: [
    react(),
    wasm(),
    VitePWA({
      // never swap the worker under a running session; a reload is offered
      registerType: "prompt",
      manifest: {
        name: "dokwa",
        short_name: "dokwa",
        start_url: "/",
        display: "standalone",
        background_color: "#faf7f2",
        theme_color: "#1b1b1b",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          {
            src: "/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,wasm,woff2}"],
        // the offline promise is real: navigation falls back to the shell
        navigateFallback: "/index.html",
        // the Lightning wasm is 14.6 MB and the till must open with no
        // network, so the precache limit is raised past it on purpose
        maximumFileSizeToCacheInBytes: 20 * 1024 * 1024,
      },
    }),
  ],
  server: {
    port: port(),
    strictPort: true,
    host: true,
  },
  preview: {
    port: port(),
    strictPort: true,
  },
  build: {
    target: "es2022",
  },
});
