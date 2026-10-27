import assert from "node:assert/strict";
import { execSync, spawn, spawnSync, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const dist = fileURLToPath(new URL("../dist/", import.meta.url));

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return address.port;
}

async function stop(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, "exit"); child.kill("SIGTERM");
  const timeout = setTimeout(() => child.kill("SIGKILL"), 7_000);
  try { await exited; } finally { clearTimeout(timeout); }
}

test("the packed CLI installs offline outside the checkout and serves both roots using Node alone", { timeout: 60_000 }, async () => {
  const archive = readdirSync(dist).find(name => name.endsWith(".tgz"));
  assert.ok(archive, "Run pnpm --filter @ieumdoc/cli package first");
  const scratch = mkdtempSync(path.join(tmpdir(), "ieumdoc-packed-"));
  const install = path.join(scratch, "install"), cwd = path.join(scratch, "unrelated cwd");
  const a = path.join(scratch, "문서 A"), b = path.join(scratch, "documents B");
  for (const folder of [install, cwd, a, b]) mkdirSync(folder);
  const env = { ...process.env };
  delete env.NODE_PATH; delete env.NODE_OPTIONS;
  let child: ChildProcess | undefined;
  try {
    // Anchor npm here even when an ancestor of the OS temp directory is another npm project.
    writeFileSync(path.join(install, "package.json"), JSON.stringify({ name: "ieumdoc-package-test", private: true }));
    copyFileSync(path.join(dist, archive), path.join(install, "artifact.tgz"));
    execSync("npm install --ignore-scripts --no-audit --no-fund --offline ./artifact.tgz", { cwd: install, env, stdio: "pipe" });
    const bin = process.platform === "win32" ? ".\\node_modules\\.bin\\ieumdoc.cmd" : "./node_modules/.bin/ieumdoc";
    assert.match(execSync(`${bin} help serve`, { cwd: install, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }), /--root/);
    const entry = path.join(install, "node_modules/@ieumdoc/cli/cli.mjs");
    const installed = JSON.parse(readFileSync(path.join(install, "node_modules/@ieumdoc/cli/package.json"), "utf8"));
    assert.equal(installed.dependencies, undefined, "No runtime install should fetch dependencies");
    const version = spawnSync(process.execPath, [entry, "--version"], { cwd, env, encoding: "utf8" });
    assert.equal(version.status, 0, version.stderr);
    assert.equal(version.stderr, "");
    assert.match(version.stdout, new RegExp(`^ieumdoc ${installed.version.replaceAll(".", "\\.")} \\((?:[a-f0-9]{12,40}|unknown)\\)\\n$`));
    for (const folder of [a, b]) writeFileSync(path.join(folder, "document.md"), "---\nieumdoc: 1\n---\n\n# Title\n\nAlpha.\n");
    const checked = spawnSync(process.execPath, [entry, "check", path.join(a, "document.md")], { cwd, env, encoding: "utf8" });
    assert.equal(checked.status, 0, checked.stderr);
    const formatted = spawnSync(process.execPath, [entry, "format", path.join(a, "document.md")], { cwd, env, encoding: "utf8" });
    assert.equal(formatted.status, 0, formatted.stderr);
    const port = await freePort(), url = `http://127.0.0.1:${port}`;
    child = spawn(process.execPath, [entry, "serve", "--port", String(port), "--root", a, "--root", b], { cwd, env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let output = "", errors = "";
    child.stderr!.on("data", data => { errors += data; });
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`Startup timed out: ${output}\n${errors}`)), 15_000);
      child!.once("error", error => { clearTimeout(timeout); reject(error); });
      child!.once("exit", code => { clearTimeout(timeout); reject(new Error(`CLI exited ${code}: ${errors}`)); });
      child!.stdout!.on("data", data => { output += data; if (output.includes("IeumDoc HTTP:")) { clearTimeout(timeout); resolve(); } });
    });
    assert.equal((await fetch(url)).status, 200);
    assert.deepEqual((await (await fetch(url + "/api/document")).json()).allowedRoots, [a, b]);
    for (const folder of [a, b]) {
      const file = path.join(folder, "document.md");
      const loaded = await (await fetch(url + `/api/document?${new URLSearchParams({ path: file })}`)).json();
      const response = await fetch(url + "/api/document", { method: "POST", headers: { Origin: url, "Content-Type": "application/json" },
        body: JSON.stringify({ path: file, revision: loaded.revision, base: { source: loaded.source },
          paragraphs: [{ path: [2], content: [{ kind: "text", text: "Packed save." }] }] }) });
      assert.equal(response.status, 200, await response.text());
      assert.equal(readFileSync(file, "utf8"), "---\nieumdoc: 1\n---\n\n# Title\n\nPacked save.\n");
    }
    const conflict = spawnSync(process.execPath, [entry, "serve", "--port", String(port), "--root", a], { cwd, env, encoding: "utf8", timeout: 10_000 });
    assert.notEqual(conflict.status, 0);
    assert.match(conflict.stderr, /EADDRINUSE/);
    await stop(child);
    await assert.rejects(fetch(url), /fetch failed/);
  } finally {
    if (child) await stop(child);
    rmSync(scratch, { recursive: true, force: true });
  }
});
