// Match the pinned electron-builder 26.15.3 NSIS key, rather than a display-name prefix.
import { UUID } from "builder-util-runtime";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { brand } from "../../../../brand.ts";

const guid = UUID.v5(brand.appId, UUID.parse("50e065bc-3134-11e6-9bab-38c9862bdaf3"));
export function installedUninstallCommand(): string {
  const key = `HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${guid}`;
  return execFileSync("powershell.exe", ["-NoProfile", "-Command",
    `$key = '${key}'; if (Test-Path -LiteralPath $key) { (Get-ItemProperty -LiteralPath $key -ErrorAction Stop).UninstallString }`], { encoding: "utf8", windowsHide: true }).trim();
}

export function installedDirectory(): string {
  const command = installedUninstallCommand();
  const executable = /^"([^"]+)"(?:\s|$)/.exec(command)?.[1];
  return executable && path.win32.basename(executable) === `Uninstall ${brand.executableName}.exe` ? path.win32.dirname(executable) : command;
}
