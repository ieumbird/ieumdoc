import { createHash } from "node:crypto";
import { createReadStream, createWriteStream, existsSync, openAsBlob, readFileSync } from "node:fs";
import { cp, mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { setTimeout as delay } from "node:timers/promises";
import profile from "../profiles/litzio-pdf-en-v1.json" with { type: "json" };
import { parseJsonPreservingIntegers, writeBundleDocument } from "./bundle.ts";
import { doclingFailureOf, type ConversionFailure, type PdfProgress, type ServerCheck } from "./server-types.ts";

export class DoclingPdfError extends Error {
  readonly failure: ConversionFailure;
  constructor(message: string, failure: ConversionFailure, options?: ErrorOptions) { super(message, options); this.failure = failure; }
}

export type PdfConversionOptions = { server: string; timeoutMs?: number; pollIntervalMs?: number; signal?: AbortSignal; onProgress?(progress: PdfProgress): void; beforePublish?(): void };

export function doclingServerUrl(value: string): URL {
  const base = new URL(value);
  if (!["http:", "https:"].includes(base.protocol) || base.username || base.password || base.search || base.hash) throw new Error("Server must be an HTTP(S) URL without credentials, query or fragment");
  base.pathname = base.pathname.replace(/\/$/u, "") + "/";
  return base;
}

/** The same preflight and compatibility decision for CLI conversion and app Settings. */
export async function checkDoclingServer(server: string, signal = AbortSignal.timeout(10_000)): Promise<ServerCheck> {
  const base = doclingServerUrl(server);
  const result: ServerCheck = { ok: false, responding: false, ready: false, compatible: false };
  let endpoint = "version";
  const request = async () => {
    const response = await fetch(new URL(endpoint, base), { signal, redirect: "error" });
    result.responding = true;
    if (!response.ok) { await response.body?.cancel(); throw new Error(`Docling ${endpoint}: HTTP ${response.status}`); }
    return response;
  };
  try {
    const versions = await (await request()).json() as Record<string, unknown>;
    result.versions = versions;
    result.version = String(versions["docling-serve"] ?? "unknown");
    result.compatible = result.version === profile.server_version;
    endpoint = "ready";
    await (await request()).body?.cancel(); result.ready = true;
    endpoint = "openapi.json";
    const spec = Buffer.from(await (await request()).arrayBuffer());
    result.openapiVersion = JSON.parse(spec.toString("utf8")).info?.version;
    result.openapiSha256 = createHash("sha256").update(spec).digest("hex");
    result.openapiMatches = result.openapiSha256 === profile.provenance.openapi_sha256;
    if (!result.compatible) { result.code = "version"; result.message = `Expected docling-serve ${profile.server_version}; received ${result.version}`; }
    else if (result.openapiVersion !== profile.server_version) { result.code = "openapi"; result.message = "OpenAPI version mismatch"; }
    else result.ok = true;
  } catch (error) {
    result.code = !result.responding ? "unreachable" : endpoint === "ready" ? "not-ready" : endpoint === "openapi.json" ? "openapi" : "version";
    result.message = error instanceof Error ? error.message : String(error);
  }
  return result;
}
async function fileDigest(file: string): Promise<{ sha256: string; bytes: number }> {
  const hash = createHash("sha256"); let bytes = 0;
  for await (const chunk of createReadStream(file)) { hash.update(chunk); bytes += chunk.length; }
  return { sha256: hash.digest("hex"), bytes };
}
function parseFile(file: string): any {
  // The raw response string dies at this boundary. Images are released one by one
  // during externalization; the original response is never retained in the bundle.
  return parseJsonPreservingIntegers(new TextDecoder("utf-8", { fatal: true }).decode(readFileSync(file)));
}

/** Official asynchronous REST adapter. No local Docling runtime, POST retries or option selection. */
export async function convertDoclingPdf(input: string, output: string, options: PdfConversionOptions) {
  if (existsSync(output)) throw new Error("Output directory already exists; choose a new directory");
  const base = doclingServerUrl(options.server);
  const timeoutMs = options.timeoutMs ?? 1_800_000, pollIntervalMs = options.pollIntervalMs ?? 1_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 2_147_483_647 || !Number.isSafeInteger(pollIntervalMs) || pollIntervalMs < 1) throw new Error("Invalid conversion timeout/poll interval");
  const deadline = AbortSignal.timeout(timeoutMs);
  const signal = options.signal ? AbortSignal.any([deadline, options.signal]) : deadline, started = Date.now();
  const progress = (phase: PdfProgress["phase"]) => options.onProgress?.({ phase, ...(taskId ? { taskId } : {}) });
  const source = await fileDigest(input);
  const pdf = await openAsBlob(input, { type: "application/pdf" });
  if (!(await pdf.slice(0, 5).text()).startsWith("%PDF-")) throw new Error("Input must be a PDF");
  const temp = await mkdtemp(path.join(tmpdir(), "litzio-docling-pdf-"));
  let taskId: string | undefined, ownedOutput = false;
  async function request(endpoint: string, init?: RequestInit): Promise<Response> {
    let response: Response;
    try { response = await fetch(new URL(endpoint, base), { ...init, signal, redirect: "error" }); }
    catch (error) { throw new DoclingPdfError(`Docling ${endpoint}: connection failed`, { code: "unreachable" }, { cause: error }); }
    if (!response.ok) {
      const failure = await response.json().catch(() => null);
      throw new DoclingPdfError(`Docling ${endpoint}: HTTP ${response.status}`, doclingFailureOf(failure));
    }
    return response;
  }
  try {
    progress("checking");
    const check = await checkDoclingServer(base.href, signal);
    signal.throwIfAborted();
    if (!check.ok) throw new DoclingPdfError(check.message!, { code: check.code! });
    const versions = check.versions!, openapiSha256 = check.openapiSha256!;
    const form = new FormData();
    for (const [key, value] of Object.entries(profile.request)) {
      for (const item of Array.isArray(value) ? value : [value]) form.append(key, typeof item === "string" ? item : JSON.stringify(item));
    }
    form.append("files", pdf, path.basename(input));
    progress("uploading");
    let status = await (await request("v1/convert/file/async", { method: "POST", body: form })).json() as any;
    if (typeof status?.task_id !== "string" || !status.task_id) throw new Error("Missing Docling task ID; submission is not retried");
    taskId = status.task_id;
    const taskPath = encodeURIComponent(taskId!);
    while (true) {
      if (status.task_id !== taskId) throw new Error("Docling task ID mismatch");
      if (status.task_status === "success") break;
      if (!["pending", "started"].includes(status.task_status)) throw new DoclingPdfError(`Docling task ${status.task_status}: ${status.error_message ?? JSON.stringify(status.failure ?? null)}`, doclingFailureOf(status));
      progress(status.task_status);
      await delay(pollIntervalMs, undefined, { signal });
      status = await (await request(`v1/status/poll/${taskPath}`)).json();
    }
    progress("downloading");
    const response = await request(`v1/result/${taskPath}`);
    if (!response.body) throw new Error("Docling returned an empty response");
    const responsePath = path.join(temp, "response.json");
    const hash = createHash("sha256"); let responseBytes = 0;
    await pipeline(Readable.fromWeb(response.body as any), new Transform({ transform(chunk, _encoding, next) {
      hash.update(chunk); responseBytes += chunk.length; next(null, chunk);
    } }), createWriteStream(responsePath, { flags: "wx" }), { signal });
    const responseDigest = { sha256: hash.digest("hex"), bytes: responseBytes };
    const result = parseFile(responsePath);
    await rm(responsePath);
    if (result?.status !== "success" || (result.errors?.length ?? 0) > 0 || !result.document?.json_content) throw new DoclingPdfError(`Docling result is not a complete success: ${result?.status}`, doclingFailureOf(result));
    const document = result.document.json_content;
    delete result.document; // release envelope/other exports before native conversion
    progress("writing");
    const bundlePath = path.join(temp, "bundle"); await mkdir(bundlePath);
    const bundle = writeBundleDocument(document, bundlePath);
    const after = await fileDigest(input);
    if (source.sha256 !== after.sha256 || source.bytes !== after.bytes) throw new Error("Source PDF changed during conversion");
    const record = {
      format: "litzio-docling-conversion", version: 1, status: "success",
      startedAt: new Date(started).toISOString(), completedAt: new Date().toISOString(), elapsedMs: Date.now() - started,
      source: { path: path.resolve(input), ...source },
      server: { url: base.href, versions, openapiSha256, baselineOpenapiMatches: openapiSha256 === profile.provenance.openapi_sha256 },
      profile, taskId, response: responseDigest,
      document: { path: "document.json", sha256: bundle.documentSha256, version: "1.10.0", pages: bundle.pages },
      images: bundle.images,
      verification: { imageBytesMatchEmbedded: true, jsonExceptImageUrisMatches: true, contentSha256: bundle.contentSha256 },
    };
    await writeFile(path.join(bundlePath, "conversion-record.json"), JSON.stringify(record, null, 2) + "\n", { flag: "wx" });
    // Exclusive creation is the output ownership boundary, including races. Move
    // files across volumes with cp rather than relying on an atomic directory rename.
    signal.throwIfAborted();
    options.beforePublish?.();
    await mkdir(output); ownedOutput = true;
    for (const name of await readdir(bundlePath)) await cp(path.join(bundlePath, name), path.join(output, name), { recursive: true, force: false, errorOnExist: true });
    signal.throwIfAborted();
    return record;
  } catch (error) {
    if (ownedOutput) await rm(output, { recursive: true, force: true });
    const reason = options.signal?.aborted ? "Cancelled; only local waiting stopped. The server task may continue." : deadline.aborted ? `Timed out after ${timeoutMs} ms` : error instanceof Error ? error.message : String(error);
    throw new DoclingPdfError(`${reason}${taskId ? ` (Docling task ${taskId})` : "; submission is never automatically retried"}`,
      { ...(deadline.aborted ? { code: "timeout" as const } : error instanceof DoclingPdfError ? error.failure : { code: "output" as const }), ...(taskId ? { taskId } : {}) }, { cause: error });
  } finally { await rm(temp, { recursive: true, force: true }); }
}
