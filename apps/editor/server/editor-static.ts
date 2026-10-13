// Fixed production Editor assets shared by the Desktop and HTTP transports.
import { readFileSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import { inside } from "./file-access.ts";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon",
  ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf",
};

/**
 * Only this origin's scripts and styles run. Inline styles are the editor engine's and KaTeX's;
 * document images can be data/blob URLs while pasted. Nothing frames, embeds or submits elsewhere.
 */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob:",
  "font-src 'self' data:", "connect-src 'self'", "object-src 'none'", "frame-src 'none'", "base-uri 'none'", "form-action 'none'",
].join("; ");

export const SECURITY_HEADERS = { "Content-Security-Policy": CONTENT_SECURITY_POLICY, "X-Content-Type-Options": "nosniff" };

const notFound = () => new Response(null, { status: 404, headers: SECURITY_HEADERS });

/** A file of the Editor build; nothing outside its folder, including through symlinks. */
export function serveEditorFile(editorDir: string, pathname: string): Response {
  let relative: string;
  try {
    relative = decodeURIComponent(pathname === "/" ? "/index.html" : pathname);
  } catch {
    return notFound();
  }
  if (relative.includes("\0")) return notFound();
  const root = realpathSync(editorDir);
  const file = path.resolve(root, `.${relative}`);
  try {
    const real = realpathSync(file);
    if (!inside(root, real) || !statSync(real).isFile()) return notFound();
    return new Response(new Uint8Array(readFileSync(real)), {
      headers: { ...SECURITY_HEADERS, "Content-Type": TYPES[path.extname(real).toLowerCase()] ?? "application/octet-stream" },
    });
  } catch {
    return notFound();
  }
}
