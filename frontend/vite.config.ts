import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { resolve, dirname, join, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { cpSync, copyFileSync, existsSync, statSync, createReadStream } from "node:fs";
import type { ServerResponse, IncomingMessage } from "node:http";

const frontend = dirname(fileURLToPath(import.meta.url));
const repository = resolve(frontend, "..");
const sourceDirs = ["assets", "css", "data", "js"] as const;
const topFiles = ["pokerlab-solver-worker.js"] as const;
const base = process.env.POKERLAB_BASE || "/poker_lab/";
const mime: Record<string, string> = {
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
  ".png": "image/png",
  ".svg": "image/svg+xml"
};

// Legacy resources are copied unchanged to preserve all relative URLs,
// including the 2,606 preflop spots. Workbox runs after writeBundle.
function legacyAssets(): Plugin {
  return {
    name: "pokerlab-legacy-assets",
    configureServer(server) {
      server.middlewares.use((request: IncomingMessage, response: ServerResponse, next) => {
        const rawPath = request.url?.split("?")[0] ?? "";
        let pathname: string;
        try { pathname = decodeURIComponent(rawPath); } catch { next(); return; }
        const stripped = pathname.startsWith(base) ? pathname.slice(base.length) : pathname.replace(/^\//, "");
        const first = stripped.split("/")[0];
        if (!sourceDirs.some((dir) => dir === first) && !topFiles.some((file) => file === stripped)) {
          next(); return;
        }
        const file = resolve(repository, stripped);
        if (!file.startsWith(repository + sep) || !existsSync(file) || !statSync(file).isFile()) {
          next(); return;
        }
        response.setHeader("Content-Type", mime[extname(file)] || "application/octet-stream");
        createReadStream(file).pipe(response);
      });
    },
    writeBundle(output) {
      const destination = output.dir || resolve(repository, "dist");
      for (const name of sourceDirs) cpSync(join(repository, name), join(destination, name), { recursive: true });
      for (const name of topFiles) copyFileSync(join(repository, name), join(destination, name));
      const wasm = resolve(repository, "engine", "pkg");
      if (existsSync(wasm)) cpSync(wasm, join(destination, "wasm"), { recursive: true });
    }
  };
}

export default defineConfig({
  root: frontend,
  base,
  plugins: [
    react(),
    legacyAssets(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: null, // Legacy bootstrap registers service-worker.js itself.
      filename: "service-worker.js",
      strategies: "generateSW",
      manifestFilename: "manifest.webmanifest",
      manifest: {
        id: "./", name: "PokerLab", short_name: "PokerLab",
        description: "Entraînement Texas Hold'em hors connexion",
        lang: "fr-FR", start_url: "./", scope: "./",
        display: "standalone", orientation: "portrait",
        background_color: "#121212", theme_color: "#121212",
        icons: [
          { src: "assets/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "assets/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "assets/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }
        ]
      },
      workbox: {
        globPatterns: ["**/*.{html,js,css,wasm,json,svg,png}"],
        maximumFileSizeToCacheInBytes: 20 * 1024 * 1024,
        navigateFallback: "index.html",
        cleanupOutdatedCaches: true
      },
      devOptions: { enabled: false }
    })
  ],
  build: { outDir: resolve(repository, "dist"), emptyOutDir: true, sourcemap: false },
  server: { fs: { allow: [repository] } }
});
