import { brand } from "../../../../brand.ts";
// Packaged RunAsNode and the shipped CLI, with an isolated integration directory.
import { listenForFetch } from "../../../../test/helpers/fetch-server.ts";
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync, lstatSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { CliIntegration, type RegistryPath } from "../../src/cli-integration.ts";
import { windowsCommand } from "../windows-command.ts";
import { verifyPackagedCli } from "./cli-check.ts";

const desktop = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const repo = path.resolve(desktop, "../..");
const exe = path.join(desktop, "release", "win-unpacked", `${brand.executableName}.exe`);
if (process.platform !== "win32") throw new Error("Packaged CLI verification runs on Windows.");

test("packaged RunAsNode satisfies CLI engines and the shim runs version/check/help/serve", async () => {
  const folder = path.join(repo, "tmp", "desktop-cli");
  mkdirSync(folder, { recursive: true });
  let user: RegistryPath = { value: "", kind: null };
  const integration = new CliIntegration(exe, folder, {
    read: async () => ({ user, machine: "", inherited: "" }),
    write: async (_previous, next) => { user = next; }, expand: value => value,
  });
  try {
    assert.equal((await integration.setEnabled(true)).status, "installed");
    const version = JSON.parse(readFileSync(path.join(desktop, "package.json"), "utf8")).version;
    verifyPackagedCli(exe, integration.shim, folder, version);
    const portServer = createServer();
    await listenForFetch(portServer);
    const address = portServer.address(); assert.ok(address && typeof address !== "string");
    await new Promise<void>(resolve => portServer.close(() => resolve()));
    const child = spawn(process.env.ComSpec ?? "cmd.exe", windowsCommand(integration.shim,
      ["serve", "--root", folder, "--port", String(address.port)]), { windowsVerbatimArguments: true, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let output = "", errors = "";
    child.stderr.on("data", data => { errors += data; });
    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`CLI serve did not become ready: ${errors}`)), 20_000);
        child.once("error", error => { clearTimeout(timer); reject(error); });
        child.once("exit", code => { clearTimeout(timer); reject(new Error(`CLI serve exited ${code}: ${errors}`)); });
        child.stdout.on("data", data => {
          output += data;
          if (output.includes(`${brand.name.en} HTTP:`)) { clearTimeout(timer); resolve(); }
        });
      });
      const response = await fetch(`http://127.0.0.1:${address.port}/`);
      assert.equal(response.status, 200);
      assert.match(await response.text(), /<html/);
      assert.equal(errors, "");
    } finally {
      if (child.exitCode === null && child.pid) {
        const stopped = once(child, "exit");
        execFileSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
        await stopped;
      }
    }
    await integration.setEnabled(false);
    assert.equal(existsSync(integration.bin), false, "disable removes an empty owned bin");
    const note = path.join(integration.bin, "user-files", "keep.txt");
    for (const uninstall of [false, true]) {
      await integration.setEnabled(true);
      mkdirSync(path.dirname(note), { recursive: true });
      writeFileSync(note, "Preserve user files.\n");
      assert.deepEqual(await integration.setEnabled(false, uninstall), { status: "off" });
      assert.equal(readFileSync(note, "utf8"), "Preserve user files.\n");
      for (const entry of [integration.shim, integration.record, integration.junction])
        assert.throws(() => lstatSync(entry), { code: "ENOENT" });
    }
  } finally { rmSync(folder, { recursive: true, force: true }); }
});
