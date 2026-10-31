/** Browser-safe module contracts. Host execution and filesystem code stay in ./server. */
export const DEFAULT_DOCLING_SERVER = "http://127.0.0.1:8001";
export type ServerCheck = {
  ok: boolean; responding: boolean; ready: boolean; version?: string; compatible: boolean;
  openapiVersion?: string; openapiSha256?: string; openapiMatches?: boolean;
  versions?: Record<string, unknown>;
  code?: "unreachable" | "not-ready" | "version" | "openapi";
  message?: string;
};
export type PdfProgress = { phase: "checking" | "uploading" | "pending" | "started" | "downloading" | "writing"; taskId?: string };
export type ConversionFailure = { code: "model-missing" | "capacity" | "source" | "timeout" | "server" | "output" | NonNullable<ServerCheck["code"]>; taskId?: string };
/** Public response causes only. A redacted internal error is never guessed to be a missing model. */
export function doclingFailureOf(value: any): ConversionFailure {
  const messages = [value?.failure?.message, value?.error_message, value?.detail, ...(Array.isArray(value?.errors) ? value.errors.map((error: any) => error?.error_message) : [])]
    .filter((message): message is string => typeof message === "string").join("\n");
  const category = value?.failure?.category;
  return { code: /(?:model[^\n]*(?:not found|missing|unavailable)|missing[^\n]*model)/iu.test(messages) ? "model-missing"
    : category === "capacity" ? "capacity" : category === "source_unavailable" ? "source" : category === "timeout" ? "timeout" : "server" };
}
export function doclingFailureMessage(failure?: ConversionFailure): string {
  switch (failure?.code) {
    case "model-missing": return "The server reports a required model is missing. Ask its operator to prepare the profile models before converting again.";
    case "capacity": return "The server has insufficient capacity. Ask its operator to check available resources before converting again.";
    case "source": return "The server could not read the PDF. Check the source PDF and server access.";
    case "timeout": return "Conversion timed out. Ask the server operator to check this task before submitting again.";
    case "unreachable": return "Could not connect to the Docling server. Check its address in Settings and that the server is running.";
    case "not-ready": return "The Docling server is not ready. Ask its operator to finish startup, then check the connection again.";
    case "version": case "openapi": return "The Docling server is incompatible. Check Settings and use docling-serve 1.32.0.";
    case "server": return "The Docling server could not process the PDF. Ask its operator to check this task in the server logs and verify the profile models.";
    default: return "IeumDoc could not create the conversion bundle. Check the PDF, result folder permissions and server logs.";
  }
}
export type ConversionJob = {
  id: string; input: string; output: string; startedAt: number;
  state: "running" | "success" | "error" | "cancelled" | "uncertain";
  progress: PdfProgress; error?: string; failure?: ConversionFailure;
};
