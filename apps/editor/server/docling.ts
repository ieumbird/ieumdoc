import os from "node:os";
import path from "node:path";
import { DoclingHost } from "@ieumdoc/docling/server";
import { ModuleDoclingHost } from "./module-runtime.ts";
import { accessPath, type FileAccess, LOCAL_FILE_ACCESS } from "./file-access.ts";

/** Host-user device setting: HTTP clients share the server account's configuration. */
export function createDoclingHost(access: FileAccess = LOCAL_FILE_ACCESS, settingsFile = process.env.IEUMDOC_DOCLING_SETTINGS_FILE ?? path.join(os.homedir(), ".ieumdoc", "docling.json")) {
  const Host = process.env.IEUMDOC_MODULE_RUNTIME === "1" ? ModuleDoclingHost : DoclingHost;
  return new Host(settingsFile, (file, create) => accessPath(file, access, create));
}
