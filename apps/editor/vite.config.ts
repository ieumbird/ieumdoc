import { fileURLToPath, URL } from "node:url";
import { randomBytes } from "node:crypto";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type ViteDevServer } from "vite";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    {
      name: "ieumdoc-document",
      configureServer(server: ViteDevServer) {
        const assetSigningKey = randomBytes(32);
        server.middlewares.use((req, res, next) => {
          const requestUrl = req.url ?? "";
          const base = server.config.base;
          const localUrl = requestUrl.startsWith(base) ? `/${requestUrl.slice(base.length)}` : requestUrl;
          const url = localUrl.split("?")[0];
          if (url === "/api/asset") {
            void server.ssrLoadModule("/server/asset-api.ts").then(mod => mod.handleAssetRequest(req, res, assetSigningKey)).catch((error: unknown) => {
              res.statusCode = 500;
              res.setHeader("Content-Type", "application/json; charset=utf-8");
              res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
            });
            return;
          }
          if (url !== "/api/document" && url !== "/api/folder" && url !== "/api/document-source" && url !== "/api/block-source" && url !== "/api/figure-validation" && !url.startsWith("/document/")) {
            next();
            return;
          }
          req.url = localUrl;
          void server.ssrLoadModule("/server/document-api.ts").then((mod) => {
            const handle = (mod as { handleDocumentRequest: typeof import("./server/document-api.ts").handleDocumentRequest })
              .handleDocumentRequest;
            return handle(req, res, next);
          }).catch((error: unknown) => {
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
          });
        });
      },
    },
  ],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
  },
});
