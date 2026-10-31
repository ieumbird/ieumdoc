// Separate module realms give producers/consumers different build identities without editing source.
import { brand } from "../../../../brand.ts";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";

const [mode, appName, root] = process.argv.slice(2);
Object.assign(brand, { appName });
if (mode === "produce") {
  const { PluginRuntime } = await import("../../server/plugin-runtime.ts");
  const { INCOMPLETE } = await import("../../server/plugin-output.ts");
  const worker = path.join(root, `worker-${appName}`); mkdirSync(worker);
  writeFileSync(path.join(worker, "worker.cjs"), `const fs = require('node:fs'), path = require('node:path');
    process.once('message', request => { fs.mkdirSync(request.output); fs.writeFileSync(path.join(request.output, 'partial.txt'), 'unpublished'); process.send({type:'complete'}, () => process.exit(0)); });`);
  const manifest = path.join(worker, "manifest.json");
  writeFileSync(manifest, JSON.stringify({ id: "docling", version: "cross-brand", workerApi: 1, entry: "worker.cjs" }));
  const runtime = new PluginRuntime(path.join(root, `installation-${appName}`), manifest);
  const input = path.join(root, `${appName}.pdf`), output = path.join(root, `${appName}-output`), id = randomUUID();
  writeFileSync(input, "%PDF-1.7\ncross-brand");
  await runtime.start({ job: { id, input, output, startedAt: Date.now(), state: "running", progress: { phase: "checking" } }, server: "http://127.0.0.1:8001", beforePublish() {
    if (existsSync(path.join(output, INCOMPLETE))) {
      const staging = runtime.store.get(id)!.staging!;
      writeFileSync(path.join(root, `${appName}-paths.json`), JSON.stringify([path.join(staging, "bundle/partial.txt"), path.join(output, "partial.txt")]));
      process.exit(0); // Crash after copying, before publication; preserve both real runtime markers.
    }
  } });
  await new Promise(() => {});
} else {
  const { RootAccess, accessPath } = await import("../../server/file-access.ts");
  const { loadEditorFile } = await import("../../server/document-api.ts");
  const files: string[] = JSON.parse(readFileSync(path.join(root, "paths.json"), "utf8"));
  const results = files.flatMap(file => [null, new RootAccess([root])].flatMap(access => [
    () => accessPath(file, access), () => loadEditorFile(file, access),
  ].map(read => { try { read(); return "allowed"; } catch (error) { return (error as Error).message; } })));
  process.stdout.write(JSON.stringify(results));
}
