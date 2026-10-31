import { brand } from "../../../../brand.ts";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import semver from "semver";
import { windowsCommand } from "../windows-command.ts";

export function verifyPackagedCli(exe: string, shim: string, folder: string, expectedVersion: string, env = process.env): void {
  const bundle = path.join(path.dirname(exe), "resources", "cli", "cli.mjs");
  const manifest = JSON.parse(readFileSync(path.join(path.dirname(bundle), "package.json"), "utf8"));
  // Match the standalone CLI's npm installation context, which Node uses for dependency
  // deprecation reporting. The separate offline package regression verifies npm installation.
  const standalone = path.join(folder, "node_modules", "@litzio", "cli");
  mkdirSync(standalone, { recursive: true });
  cpSync(path.dirname(bundle), standalone, { recursive: true });
  const node = spawnSync(exe, ["-p", "process.versions.node"], { env: { ...env, ELECTRON_RUN_AS_NODE: "1" }, encoding: "utf8", timeout: 15_000 });
  assert.equal(node.status, 0, node.stderr);
  assert.ok(semver.satisfies(node.stdout.trim(), manifest.engines.node), `Electron Node ${node.stdout.trim()} must satisfy ${manifest.engines.node}`);
  const run = (args: string[]) => spawnSync(process.env.ComSpec ?? "cmd.exe", windowsCommand(shim, args),
    { cwd: folder, env, windowsVerbatimArguments: true, windowsHide: true, encoding: "utf8", timeout: 20_000 });
  const version = run(["--version"]);
  assert.equal(version.status, 0, version.stderr);
  assert.match(version.stdout, new RegExp(`^${brand.cliCommand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} ${expectedVersion.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\(desktop, (?:[a-f0-9]{12,40}|unknown)\\)\\r?\\n$`));
  assert.equal(version.stderr, "");
  const good = path.join(folder, "한글 문서 & (test) 😀.md"), bad = path.join(folder, "invalid.md");
  writeFileSync(good, "---\nlitzio: 1\n---\n\n# CLI check\n\nContent.\n");
  writeFileSync(bad, "Not a native document.\n");
  for (const [args, status] of [[['help'], 0], [['check', good, '--format', 'json'], 0], [['check', bad, '--format', 'json'], 1]] as const) {
    const actual = run([...args]);
    const independent = spawnSync(process.execPath, [path.join(standalone, "cli.mjs"), ...args], { cwd: folder, env, encoding: "utf8", timeout: 20_000 });
    assert.equal(actual.status, status, actual.stderr);
    assert.deepEqual({ status: actual.status, stdout: actual.stdout, stderr: actual.stderr },
      { status: independent.status, stdout: independent.stdout, stderr: independent.stderr }, `shim/Node parity: ${args[0]}`);
    if (args[0] === "check") assert.equal(JSON.parse(actual.stdout).ok, status === 0);
  }
}
