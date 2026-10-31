import os from "node:os";
import path from "node:path";
import { DoclingHost } from "@litzio/docling/server";
import { accessPath, type FileAccess, LOCAL_FILE_ACCESS } from "./file-access.ts";

import { fileURLToPath } from "node:url";
import { PluginRuntime } from "./plugin-runtime.ts";

declare const __LITZIO_DOCLING_DIRECTORY__: string;
export function bundledDoclingManifest() {
  return fileURLToPath(new URL(`${typeof __LITZIO_DOCLING_DIRECTORY__ === "string" ? __LITZIO_DOCLING_DIRECTORY__ : "../../../tmp/docling-worker"}/manifest.json`, import.meta.url));
}
export function pluginsDirectory() { return process.env.LITZIO_PLUGINS_DIR ?? path.join(os.homedir(), ".ieumdoc", "plugins"); }

/** Host-user device setting: HTTP clients share the server account's configuration. */
export function createDoclingHost(access: FileAccess = LOCAL_FILE_ACCESS, settingsFile = process.env.LITZIO_DOCLING_SETTINGS_FILE ?? path.join(os.homedir(), ".ieumdoc", "docling.json"), options?: { directory?: string; manifest?: string; timeoutMs?: number }) {
  let runtime: PluginRuntime | undefined;
  let closed = false, closing: Promise<void> | undefined;
  const directory = options?.directory ?? pluginsDirectory();
  const getRuntime = () => {
    if (closed) throw new Error("The plugin runtime is closing.");
    return runtime ??= new PluginRuntime(directory, options?.manifest ?? bundledDoclingManifest(), options?.timeoutMs);
  };
  const host = new DoclingHost(settingsFile, (file, create) => accessPath(file, access, create), {
    start: request => getRuntime().start(request), current: id => getRuntime().current(id),
    cancel: id => getRuntime().cancel(id), close: () => {
      closed = true;
      return closing ??= runtime?.close() ?? Promise.resolve();
    },
  });
  return Object.assign(host, { plugins: (seed = false) => {
    const runtime = getRuntime();
    if (seed) runtime.ensureBundled();
    return runtime.store;
  } });
}
