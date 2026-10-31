import { convertDoclingPdf, DoclingPdfError } from "./pdf.ts";

// IPC disconnect ends local work once the event loop services it. It does not
// cancel a remote Docling task or sandbox untrusted CPU loops. No child process
// is started by this worker.
process.once("disconnect", () => process.exit(1));
process.once("message", async (request: { input: string; output: string; server: string }) => {
  try {
    await convertDoclingPdf(request.input, request.output, { server: request.server,
      onProgress: progress => process.send?.({ type: "progress", progress }),
    });
    process.send?.({ type: "complete" }, () => process.exit(0));
  } catch (error) {
    process.send?.({ type: "failure", message: error instanceof Error ? error.message : String(error),
      failure: error instanceof DoclingPdfError ? error.failure : { code: "output" },
    }, () => process.exit(1));
  }
});
