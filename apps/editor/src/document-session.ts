import { SaveContentError } from "../shared/save-error.ts";
import type { FigureContent } from "@litzio/core";
import type { DocumentFileResponse, EditorFileResponse, TextSaveRequest, DocumentStartResponse, DocumentErrorResponse, SaveRequest, SaveResponse, SourceResponse } from "../shared/document-protocol.ts";

type DocumentResponse = EditorFileResponse;

/** The Host's Core admission failure, identified by code rather than message text. */
export class NativeOpenError extends Error {
  constructor(readonly reason: string, readonly action: string, readonly code?: string) {
    super(reason);
    this.name = "NativeOpenError";
  }
}

export class SaveConflictError extends SaveContentError {
  constructor(message: string) {
    super(message, undefined, { phase: "revision", action: "Copy applied content from Source, or Reload only when you are ready to discard local changes." });
    this.name = "SaveConflictError";
  }
}

export function requestDocument(method: "PUT", filePath: string, bibliographyRoot?: string): Promise<DocumentFileResponse>;
export function requestDocument(method: "GET", filePath?: string, bibliographyRoot?: string): Promise<DocumentResponse | DocumentStartResponse>;
export async function requestDocument(
  method: "GET" | "PUT",
  filePath?: string,
  bibliographyRoot?: string,
): Promise<DocumentResponse | DocumentStartResponse> {
  const body = method === "PUT" ? { path: filePath } : undefined;
  const query = method === "GET" && filePath ? `?path=${encodeURIComponent(filePath)}` : "";
  const response = await fetch(`${import.meta.env?.BASE_URL ?? "/"}api/document${query}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = (await response.json()) as Partial<Omit<DocumentFileResponse, "kind">> & { kind?: "native" | "text" } & Partial<DocumentErrorResponse> & Partial<DocumentStartResponse>;
  if (response.status === 409) {
    throw new SaveConflictError(payload.error ?? "Document changed outside the editor. Reload before saving.");
  }
  // Only the first request, which names no document, may start without one.
  if (response.ok && method === "GET" && !filePath && payload.start === true) {
    return { start: true, ...(payload.samples ? { samples: payload.samples } : {}),
      ...(payload.sampleProblem ? { sampleProblem: payload.sampleProblem } : {}),
      ...(Array.isArray(payload.allowedRoots) && payload.allowedRoots.every(root => typeof root === "string") ? { allowedRoots: payload.allowedRoots } : {}) };
  }
  if (!response.ok || (payload.kind !== "text" && !payload.document) || typeof payload.source !== "string" || typeof payload.revision !== "string" || typeof payload.path !== "string") {
    if (!response.ok && method === "GET" && payload.code?.startsWith("native-")) {
      throw new NativeOpenError(payload.issue?.reason ?? payload.error ?? "Unsupported native document.", payload.issue?.action ?? "", payload.code);
    }
    throw new SaveContentError(payload.error ?? `request failed (${response.status})`, payload.target, payload.failure);
  }
  if (payload.kind === "text") return { ...(payload.samples ? { samples: payload.samples } : {}), ...(payload.sampleProblem ? { sampleProblem: payload.sampleProblem } : {}), kind: "text", path: payload.path, source: payload.source, revision: payload.revision };
  const declarations = payload.bibliography?.declarations ?? [];
  const sources = await requestBibliography(payload.path, payload.revision, declarations, bibliographyRoot);
  return {
    ...(payload.samples ? { samples: payload.samples } : {}),
    ...(payload.sampleProblem ? { sampleProblem: payload.sampleProblem } : {}),
    bibliographyRoot,
    bibliography: { declarations, sources },
    kind: "native",
    path: payload.path,
    document: payload.document!,
    revision: payload.revision,
    source: payload.source,
    endnotesInPlace: payload.endnotesInPlace !== false,
  };
}

/** Only the saved document's declarations can be read by the existing Host endpoint. */
export async function requestBibliography(path: string, revision: string, declarations: string[], root?: string) {
  if (declarations.length) {
    try {
      const resourceQuery = new URLSearchParams({ path, revision });
      if (root) resourceQuery.set("root", root);
      const resourceResponse = await fetch(`${import.meta.env?.BASE_URL ?? "/"}api/bibliography?${resourceQuery}`);
      const resources = await resourceResponse.json();
      if (!resourceResponse.ok || resources.revision !== revision || !Array.isArray(resources.sources)) throw new Error();
      return resources.sources as import("@litzio/core").BibliographySource[];
    } catch { return declarations.map(source => ({ source, status: "error" as const, code: "bibliography-unreadable" as const })); }
  }
  return [];
}

export async function requestSave(body: SaveRequest | TextSaveRequest): Promise<SaveResponse> {
  let response: Response;
  let payload: Partial<SaveResponse> & Partial<DocumentErrorResponse>;
  try {
    response = await fetch(`${import.meta.env?.BASE_URL ?? "/"}api/document`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    payload = await response.json();
  } catch (cause) {
    throw new SaveContentError("The Host response could not be received or read. The file may already have been saved.", undefined, {
      cause, phase: "transport", action: "Keep your edits. Check the connection to the Host and the disk version before deciding whether to save again or Reload.",
    });
  }
  if (response.status === 409) {
    throw new SaveConflictError(payload?.error ?? "Document changed outside the editor.");
  }
  if (!response.ok) {
    throw new SaveContentError(payload?.error ?? `request failed (${response.status})`, payload?.target ?? payload?.failure?.target, {
      phase: "request", action: "The Host rejected this request. Keep your edits and report this error if the reason does not identify a correction.", ...payload?.failure,
    });
  }
  if (!payload || typeof payload.revision !== "string") {
    throw new SaveContentError("The Host did not return a valid Save acknowledgement. The file may already have been saved.", undefined, {
      phase: "transport", action: "Keep your edits and check the disk version before saving again or Reloading.",
    });
  }
  return { revision: payload.revision };
}

/** Asks the Host for the canonical Markdown a Save request would write. */
export async function requestSource(body: SaveRequest): Promise<string> {
  const response = await fetch(`${import.meta.env?.BASE_URL ?? "/"}api/document-source`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as Partial<SourceResponse> & Partial<DocumentErrorResponse>;
  if (!response.ok || typeof payload.markdown !== "string") {
    throw new Error(payload.error ?? `request failed (${response.status})`);
  }
  return payload.markdown;
}

/** Asks the Host to run Core's persistent Figure validation of an Apply: properties and label. */
export async function validateFigure(figure: FigureContent, label: string): Promise<string | undefined> {
  const response = await fetch(`${import.meta.env?.BASE_URL ?? "/"}api/figure-validation`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...figure, label }),
  });
  const payload = (await response.json()) as { error?: string | null };
  if (!response.ok) throw new Error(payload.error ?? `request failed (${response.status})`);
  return payload.error ?? undefined;
}

export function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

/** Per hook instance: invalidates callbacks when an editor is replaced or the hook unmounts. */
export function createDocumentSessionLifetime() {
  let generation = 0;
  let active = true;
  let opening = 0;
  const capture = () => {
    const started = generation;
    return () => active && generation === started;
  };
  return {
    capture,
    replace() { return ++generation; },
    beginOpen() {
      const current = capture();
      const request = ++opening;
      return () => current() && opening === request;
    },
    activate() { active = true; return generation; },
    dispose() { active = false; generation++; },
  };
}
