// The public NsisUpdater signature hook, with no compatibility path that skips verification.
import { execFile, execFileSync } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { parseDn } from "builder-util-runtime";

export type WindowsSignature = { status: string; path: string; subject: string | null };

function command(file: string) {
  if (process.platform !== "win32") throw new Error("Authenticode requires Windows");
  const executable = path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  const script = '$ErrorActionPreference = "Stop"; ' +
    'Import-Module "$PSHOME\\Modules\\Microsoft.PowerShell.Security\\Microsoft.PowerShell.Security.psd1"; ' +
    `$s = Get-AuthenticodeSignature -LiteralPath '${file.replaceAll("'", "''")}'; ` +
    '@{ status = $s.Status.ToString(); path = $s.Path; subject = $s.SignerCertificate.Subject } | ConvertTo-Json -Compress';
  // A Node process started by PowerShell 7 inherits its module path. Windows PowerShell 5.1
  // must load its own modules, as electron-updater also does. No shell; the path is an escaped literal.
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.toLowerCase() === "psmodulepath") delete env[key];
  return { executable, args: ["-NoProfile", "-NonInteractive", "-Command", script], env };
}

function result(stdout: string): WindowsSignature {
  const value = JSON.parse(stdout) as Partial<WindowsSignature>;
  if (typeof value.status !== "string" || typeof value.path !== "string" ||
    !(value.subject === null || typeof value.subject === "string")) throw new Error("Invalid Authenticode result");
  return value as WindowsSignature;
}

export function readSignatureSync(file: string): WindowsSignature {
  const { executable, args, env } = command(file);
  return result(execFileSync(executable, args, { env, encoding: "utf8", timeout: 20_000, windowsHide: true }));
}

/** The installer must be Valid, refer to the downloaded file and match an allowed publisher. */
export function signatureProblem(publishers: string[], file: string, signature: WindowsSignature): string | null {
  if (signature.status !== "Valid") return `signature is ${signature.status}`;
  if (path.resolve(signature.path).toLowerCase() !== path.resolve(file).toLowerCase()) return "signature names another file";
  if (!signature.subject || !publishers.length) return "signature has no allowed publisher";
  const subject = parseDn(signature.subject);
  for (const publisher of publishers) {
    if (!publisher.trim()) continue;
    const expected = parseDn(publisher);
    if (expected.size ? [...expected].every(([key, value]) => subject.get(key) === value) : subject.get("CN") === publisher) return null;
  }
  return "signature publisher does not match the application owner";
}

/** Tool failure, timeout and malformed responses are failures, never permission to install. */
export async function verifyUpdateSignature(publishers: string[], file: string): Promise<string | null> {
  try {
    const { executable, args, env } = command(file);
    const { stdout } = await promisify(execFile)(executable, args, { env, encoding: "utf8", timeout: 20_000, windowsHide: true });
    return signatureProblem(publishers, file, result(stdout));
  } catch (error) {
    return `Signature verification failed: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`;
  }
}
