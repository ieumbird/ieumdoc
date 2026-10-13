import type { IncomingMessage } from "node:http";

export class RequestBodyError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

/** Count received bytes, including chunked requests. No partial request reaches a file operation. */
export async function readRequestBody(req: IncomingMessage, limit: number): Promise<Buffer> {
  if (Number(req.headers["content-length"]) > limit) {
    req.resume();
    throw new RequestBodyError("Request body is too large.", 413);
  }
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let failed = false;
    const fail = (error: Error) => {
      if (failed) return;
      failed = true;
      chunks.length = 0;
      reject(error);
    };
    req.on("data", (value: Buffer | string) => {
      if (failed) return;
      const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
      size += chunk.length;
      if (size > limit) fail(new RequestBodyError("Request body is too large.", 413));
      else chunks.push(chunk);
    });
    req.on("end", () => { if (!failed) resolve(Buffer.concat(chunks)); });
    req.on("aborted", () => fail(new RequestBodyError("Request was interrupted.")));
    req.on("error", fail);
  });
}
