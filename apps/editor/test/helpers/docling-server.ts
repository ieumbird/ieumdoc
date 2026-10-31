import { createServer } from "node:http";
import { listenForFetch } from "../../../../test/helpers/fetch-server.ts";

export type DoclingMode = "success" | "pending" | "partial" | "failure" | "model-missing" | "redacted" | "version" | "not-ready";
/** Real HTTP/multipart and polling; small valid source bundle keeps UI/Host tests independent of Docker. */
export async function fakeDoclingServer() {
  let mode: DoclingMode = "success", polls = 0, submissions = 0;
  const requests: string[] = [];
  const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j9ioAAAAASUVORK5CYII=";
  const server = createServer(async (req, res) => {
    requests.push(`${req.method} ${req.url}`);
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/version") res.end(JSON.stringify({ "docling-serve": mode === "version" ? "1.31.0" : "1.32.0" }));
    else if (req.url === "/ready") { res.statusCode = mode === "not-ready" ? 503 : 200; res.end("{}"); }
    else if (req.url === "/openapi.json") res.end(JSON.stringify({ info: { version: "1.32.0" } }));
    else if (req.url === "/v1/convert/file/async" && req.method === "POST") {
      for await (const _ of req) { /* Consume the upload before replying. */ }
      submissions++; polls = 0;
      res.end(JSON.stringify({ task_id: `fixture-${submissions}`, task_status: "pending" }));
    } else if (req.url?.startsWith("/v1/status/poll/")) {
      polls++;
      res.end(JSON.stringify({ task_id: `fixture-${submissions}`, task_status: ["failure", "model-missing", "redacted"].includes(mode) ? "failure" : mode === "pending" || polls === 1 ? "started" : "success",
        error_message: mode === "redacted" ? "Internal processing error." : "Fixture conversion failed",
        failure: mode === "model-missing" ? { category: "internal", message: "Model 'docling-project/CodeFormulaV2' not found in artifacts_path.\nTraceback: secret-server-path" } : null }));
    } else if (req.url?.startsWith("/v1/result/")) {
      if (mode === "partial") { res.write('{"status":"success","document":'); return; }
      res.end(JSON.stringify({ status: "success", errors: [], document: { json_content: {
        schema_name: "DoclingDocument", version: "1.10.0", name: "Fixture PDF",
        body: { self_ref: "#/body", children: [{ $ref: "#/texts/0" }] },
        texts: [{ self_ref: "#/texts/0", parent: { $ref: "#/body" }, children: [], label: "text", text: "Converted PDF content.", orig: "Converted PDF content.",
          prov: [{ page_no: 1, bbox: { l: 10, r: 90, t: 10, b: 30, coord_origin: "TOPLEFT" }, charspan: [0, 22] }] }],
        pages: { "1": { page_no: 1, size: { width: 100, height: 100 }, image: { uri: `data:image/png;base64,${png}`, mimetype: "image/png", dpi: 72, size: { width: 1, height: 1 } } } },
      } } }));
    } else { res.statusCode = 404; res.end("{}"); }
  });
  await listenForFetch(server);
  return {
    url: `http://127.0.0.1:${(server.address() as { port: number }).port}`,
    requests, submissions: () => submissions, mode: (value: DoclingMode) => { mode = value; },
    close: () => new Promise<void>((resolve, reject) => { server.closeAllConnections(); server.close(error => error ? reject(error) : resolve()); }),
  };
}
