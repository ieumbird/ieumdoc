import { fileURLToPath, URL } from "node:url";
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
        server.middlewares.use((req, res, next) => {
          const url = req.url?.split("?")[0] ?? "";
          if (url !== "/api/document" && url !== "/api/figure-validation" && !url.startsWith("/document/")) {
            next();
            return;
          }
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
