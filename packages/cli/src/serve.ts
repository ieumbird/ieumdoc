import { parseArgs } from "node:util";
import { startHttpHost } from "../../../apps/editor/server/http-host.ts";

export async function serve(args: string[], editorDir: string): Promise<void> {
  const { values, tokens } = parseArgs({ args, strict: true, allowPositionals: false, tokens: true, options: {
    root: { type: "string", multiple: true }, port: { type: "string" }, host: { type: "string" }, "public-origin": { type: "string" },
    drawio: { type: "string" }, "drawio-libraries": { type: "string" },
  } });
  const seen = new Set<string>();
  for (const token of tokens) {
    if (token.kind !== "option" || token.name === "root") continue;
    if (seen.has(token.name)) throw new Error(`Specify --${token.name} only once.`);
    seen.add(token.name);
  }
  const port = values.port === undefined ? 5180 : Number(values.port);
  if ((values.port !== undefined && !/^\d+$/.test(values.port)) || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("--port must be an integer from 1 to 65535.");
  }
  const host = await startHttpHost({ roots: values.root ?? [], editorDir, port, host: values.host, publicOrigin: values["public-origin"],
    drawio: { webappDir: values.drawio, librariesDir: values["drawio-libraries"] } });
  process.stdout.write(`IeumDoc HTTP: ${host.url}\nAllowed folders:\n${host.roots.map(root => `  ${root}`).join("\n")}\n${values.drawio ? `Draw.io: ${host.url}/drawio/\n` : ""}`);
  const stop = () => {
    process.off("SIGINT", stop);
    process.off("SIGTERM", stop);
    void host.close().catch(error => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; });
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}
