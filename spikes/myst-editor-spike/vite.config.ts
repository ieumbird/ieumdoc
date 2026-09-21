import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { IncomingMessage } from "node:http";
import { defineConfig, type Plugin } from "vite";
import { parseDocument, serializeDocument } from "./src/document.ts";

const root = path.dirname(fileURLToPath(import.meta.url));
const samplePath = path.join(root, "sample.md");
const outputPath = path.join(root, "output.md");

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function documentApi(): Plugin {
  return {
    name: "narudoc-document-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        try {
          if (req.url === "/api/document" && req.method === "GET") {
            const source = readFileSync(samplePath, "utf8");
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify(parseDocument(source)));
            return;
          }
          if (req.url === "/api/save" && req.method === "POST") {
            const payload = JSON.parse(await readBody(req)) as { ast: unknown };
            const source = readFileSync(samplePath, "utf8");
            const original = parseDocument(source);
            const markdown = serializeDocument(original, payload.ast as never);
            writeFileSync(outputPath, markdown.endsWith("\n") ? markdown : `${markdown}\n`);
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify({ markdown, path: "output.md" }));
            return;
          }
        } catch (error) {
          res.statusCode = 500;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
          return;
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [documentApi()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
  },
});
