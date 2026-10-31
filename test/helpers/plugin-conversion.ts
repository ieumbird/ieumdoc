import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

/** Distribution smoke: actual Host transport, shipped worker and native bundle.
 * Failure semantics/interpretation are covered by the shared Host/module tests. */
export async function verifyPackagedWorker(send: (endpoint: string, method?: string, body?: unknown) => Promise<Response>, folder: string, server: string) {
  const input = path.join(folder, "plugin-smoke.pdf"), source = "%PDF-1.7\npackaged worker fixture";
  writeFileSync(input, source);
  assert.equal((await send("docling-settings", "PUT", { server })).status, 200);
  const id = randomUUID(), response = await send("docling-conversion", "POST", { path: input, id });
  assert.equal(response.status, 200, await response.clone().text());
  let job = await response.json();
  const deadline = Date.now() + 15_000;
  while (job.state === "running") {
    if (Date.now() >= deadline) throw new Error("Packaged worker did not finish");
    await delay(25); job = await (await send("docling-conversion")).json();
  }
  assert.equal(job.state, "success", job.error);
  assert.equal(readFileSync(input, "utf8"), source);
  assert.ok(existsSync(path.join(job.output, "document.json")));
  const comparison = await send(`docling-compare?${new URLSearchParams({ path: path.join(job.output, "document.md") })}`);
  assert.equal(comparison.status, 200); assert.equal((await comparison.json()).stale, false);
  return job.output as string;
}
