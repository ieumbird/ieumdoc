import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import type { EnvironmentPort, PathSnapshot, RegistryPath } from "./cli-integration.ts";

const exec = promisify(execFile);
const registry = String.raw`
$ErrorActionPreference = 'Stop'
$key = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Environment', $true)
function Read-Path {
  $raw = $key.GetValue('Path', $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
  if ($null -eq $raw) { return @{value=''; kind=$null} }
  $kind = $key.GetValueKind('Path').ToString()
  if ($kind -ne 'String' -and $kind -ne 'ExpandString') { throw 'Unsupported user PATH registry type.' }
  return @{value=$raw; kind=$kind}
}
`;

async function powershell(script: string): Promise<string> {
  const executable = path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  const { stdout } = await exec(executable, ["-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand",
    Buffer.from(`[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)\n${script}`, "utf16le").toString("base64")],
  { windowsHide: true, encoding: "utf8", timeout: 15_000 });
  return stdout.trim();
}

/** No registry access occurs until an explicit read/write call. Tests inject another port. */
export function windowsEnvironment(): EnvironmentPort {
  return {
    expand: value => value.replace(/%([^%]+)%/g, (whole, name: string) => {
      const key = Object.keys(process.env).find(key => key.toLowerCase() === name.toLowerCase());
      return key ? process.env[key] ?? whole : whole;
    }),
    async read(): Promise<PathSnapshot> {
      const result = JSON.parse(await powershell(registry + String.raw`
try {
  $machine = [Microsoft.Win32.Registry]::LocalMachine.OpenSubKey('SYSTEM\CurrentControlSet\Control\Session Manager\Environment')
  try { $machinePath = $machine.GetValue('Path', '', [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames) }
  finally { $machine.Dispose() }
  @{user=(Read-Path); machine=$machinePath} | ConvertTo-Json -Compress
} finally { $key.Dispose() }
`));
      return { ...result, inherited: process.env.PATH ?? "" };
    },
    async write(previous: RegistryPath, next: RegistryPath): Promise<void> {
      // Encode data separately from executable PowerShell; no path or registry value is shell code.
      const data = Buffer.from(JSON.stringify({ previous, next }), "utf8").toString("base64");
      await powershell(registry + `\n$data = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${data}')) | ConvertFrom-Json\n` + String.raw`
try {
  $current = Read-Path
  if ($current.value -cne $data.previous.value -or $current.kind -cne $data.previous.kind) { throw 'User PATH changed; try again.' }
  $key.SetValue('Path', $data.next.value, [Microsoft.Win32.RegistryValueKind]$data.next.kind)
} finally { $key.Dispose() }
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class IeumDocEnvironment {
  [DllImport("user32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  public static extern IntPtr SendMessageTimeout(IntPtr h, uint m, UIntPtr w, string l, uint f, uint t, out UIntPtr r);
}
'@
$result = [UIntPtr]::Zero
[void][IeumDocEnvironment]::SendMessageTimeout([IntPtr]0xffff, 0x001a, [UIntPtr]::Zero, 'Environment', 2, 5000, [ref]$result)
`);
    },
  };
}
