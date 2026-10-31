import { startHttpHost } from "../../server/http-host.ts";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";

const [mode, root] = process.argv.slice(2);
if (mode === "serve") {
  const host = await startHttpHost({ roots: [root], editorDir: root, port: 0 });
  process.send?.({ url: host.url });
  process.once("message", async () => { await host.close(); process.exit(0); });
} else if (mode === "lock") {
  const db = new DatabaseSync(path.join(root, "runtime.sqlite"));
  db.exec("BEGIN IMMEDIATE; DELETE FROM plugins");
  process.send?.({ locked: true });
  setInterval(() => {}, 1000);
}
