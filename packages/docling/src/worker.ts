// Trusted, unsandboxed spike worker. All interpretation stays in the existing converter.
import { createInterface } from "node:readline";
import { convertDoclingPdf } from "./pdf.ts";

const send = (value: unknown) => new Promise<void>((resolve, reject) => process.stdout.write(JSON.stringify(value) + "\n", error => error ? reject(error) : resolve()));
const lines = createInterface({ input: process.stdin });
void send({ type: "ready" });
// A dead Host closes the pipe. Never publish or keep a detached local worker alive.
process.stdin.on("end", () => process.exit(2));
lines.once("line", async line => {
  try {
    const request = JSON.parse(line);
    await convertDoclingPdf(request.input, request.output, {
      server: request.server, timeoutMs: request.timeoutMs,
      onProgress: progress => { void send({ type: "progress", progress }); },
    });
    await send({ type: "done" });
    process.exit(0);
  } catch (error) {
    await send({ type: "failure", error: error instanceof Error ? error.message : String(error),
      failure: (error as { failure?: unknown }).failure });
    process.exit(1);
  }
});
