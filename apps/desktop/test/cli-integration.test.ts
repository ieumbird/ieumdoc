import assert from "node:assert/strict";
import { copyFile, mkdtemp, mkdir, readFile, writeFile, unlink, rm, lstat, readlink } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { CLI_SHIM, CliIntegration, editUserPath, type EnvironmentPort, type RegistryPath } from "../src/cli-integration.ts";
import { windowsCommand } from "./windows-command.ts";

async function fixture(run: (f: Awaited<ReturnType<typeof setup>>) => Promise<void>) {
  const f = await setup();
  try { await run(f); } finally { await rm(f.root, { recursive: true, force: true }); }
}
async function setup() {
  const root = await mkdtemp(path.join(os.tmpdir(), "litzio-cli-integration-"));
  const app = path.join(root, "설치 app !% & (test)");
  await mkdir(path.join(app, "resources", "cli"), { recursive: true });
  const exe = path.join(app, "Litzio.exe");
  await writeFile(exe, "test executable");
  await writeFile(path.join(app, "resources", "cli", "cli.mjs"), "test CLI");
  const data = { user: { value: "%USERPROFILE%\\tools;;C:\\Other;", kind: "ExpandString" } as RegistryPath,
    machine: "", inherited: "", writes: 0, fail: false };
  const environment: EnvironmentPort = {
    expand: value => value.replaceAll("%USERPROFILE%", root),
    read: async () => ({ user: { ...data.user }, machine: data.machine, inherited: data.inherited }),
    write: async (previous, next) => {
      assert.deepEqual(previous, data.user);
      if (data.fail) throw new Error("injected PATH failure");
      data.user = { ...next }; data.writes++;
    },
  };
  const integration = new CliIntegration(exe, root, environment);
  return { root, app, exe, data, environment, integration };
}

test("PATH edits preserve raw unrelated segments/order and recognize quoted, expanded, case-varied paths", () => {
  const bin = "C:\\Users\\Me\\Litzio\\bin";
  const expand = (v: string) => v.replace(/%LOCALAPPDATA%/ig, "C:\\Users\\Me");
  const raw = "%Unrelated%\\bin;;C:\\Other;";
  const enabled = editUserPath(raw, bin, true, expand);
  assert.equal(enabled, `${raw};${bin}`);
  assert.equal(editUserPath(enabled, bin, false, expand), raw);
  const equivalent = `${raw};"%LOCALAPPDATA%\\Litzio\\bin\\"`;
  assert.equal(editUserPath(equivalent, bin, true, expand), equivalent);
  assert.equal(editUserPath(equivalent, bin, false, expand), raw);
  assert.equal(editUserPath("", bin, false, expand), "");
  assert.equal(editUserPath("", bin, true, expand), bin);
  assert.equal(editUserPath(`${bin};C:\\Other;${bin}`, bin, false, expand), "C:\\Other");
});

test("off by default; enable/disable preserves registry kind and user files, and is idempotent", async () => {
  await fixture(async ({ data, integration, app }) => {
    assert.deepEqual(await integration.state(), { status: "off" });
    assert.equal(data.writes, 0);
    for (const uninstall of [false, true]) for (const kind of ["String", "ExpandString"] as const) {
      data.user.kind = kind;
      const original = { ...data.user };
      assert.equal((await integration.setEnabled(true)).status, "installed");
      assert.equal(data.user.kind, kind);
      assert.equal(await readFile(integration.shim, "utf8"), CLI_SHIM);
      assert.ok((await lstat(integration.junction)).isSymbolicLink());
      assert.equal(path.resolve(await readlink(integration.junction)), path.resolve(app));
      await writeFile(path.join(integration.bin, "user-note.txt"), "keep");
      const writes: number = data.writes;
      assert.equal((await integration.setEnabled(true)).status, "installed");
      assert.equal(data.writes, writes);
      assert.deepEqual(await integration.setEnabled(false, uninstall), { status: "off" });
      assert.deepEqual(data.user, original);
      assert.equal(await readFile(path.join(integration.bin, "user-note.txt"), "utf8"), "keep");
      await assert.rejects(lstat(integration.shim), { code: "ENOENT" });
      await assert.rejects(lstat(integration.junction), { code: "ENOENT" });
      await assert.rejects(lstat(integration.record), { code: "ENOENT" });
      assert.deepEqual(await integration.setEnabled(false, uninstall), { status: "off" });
    }
  });
});

test("disable and uninstall remove an empty owned bin without removing its parent", async () => {
  for (const uninstall of [false, true]) await fixture(async ({ integration, data }) => {
    const original = { ...data.user };
    await integration.setEnabled(true);
    assert.deepEqual(await integration.setEnabled(false, uninstall), { status: "off" });
    assert.deepEqual(data.user, original);
    await assert.rejects(lstat(integration.bin), { code: "ENOENT" });
    assert.ok((await lstat(path.dirname(integration.bin))).isDirectory());
    assert.deepEqual(await integration.setEnabled(false, uninstall), { status: "off" });
  });
});

test("missing target/shim/PATH and partial failures are visible and repairable", async () => {
  await fixture(async ({ data, integration, exe }) => {
    data.fail = true;
    await assert.rejects(integration.setEnabled(true), /injected PATH failure/);
    assert.equal((await integration.state()).status, "broken");
    data.fail = false;
    assert.equal((await integration.setEnabled(true)).status, "installed");
    await unlink(integration.shim);
    assert.equal((await integration.state()).status, "broken");
    assert.equal((await integration.setEnabled(true)).status, "installed");
    await unlink(exe);
    assert.equal((await integration.state()).status, "broken");
    await assert.rejects(integration.setEnabled(true), /requires the installed/);
    assert.equal((await integration.setEnabled(false)).status, "off");
  });
});

test("foreign PATH commands and foreign files are reported without replacement or registry writes", async () => {
  await fixture(async ({ data, integration, root }) => {
    const foreign = path.join(root, "separate CLI");
    await mkdir(foreign);
    const command = path.join(foreign, "litzio.ps1");
    await writeFile(command, "foreign");
    for (const source of ["machine", "inherited"] as const) {
      data[source] = foreign;
      assert.equal((await integration.state()).conflict, command);
      await assert.rejects(integration.setEnabled(true), /Another litzio command/);
      data[source] = "";
    }
    await mkdir(integration.bin, { recursive: true });
    await writeFile(integration.shim, "user script");
    assert.equal((await integration.state()).status, "off");
    await assert.rejects(integration.setEnabled(true), /Another file/);
    assert.match((await integration.setEnabled(false)).conflict!, /Another file/);
    assert.equal(await readFile(integration.shim, "utf8"), "user script");
    assert.equal(data.writes, 0);
  });
});

test("repair rebinds a moved app; uninstall of an older copy does not remove the new registration", async () => {
  await fixture(async ({ data, integration, root, environment }) => {
    await integration.setEnabled(true);
    const next = path.join(root, "new app");
    await mkdir(path.join(next, "resources", "cli"), { recursive: true });
    await writeFile(path.join(next, "Litzio.exe"), "new executable");
    await writeFile(path.join(next, "resources", "cli", "cli.mjs"), "new CLI");
    const moved = new CliIntegration(path.join(next, "Litzio.exe"), root, environment);
    assert.equal((await moved.state()).status, "broken");
    await moved.setEnabled(true);
    assert.equal((await moved.state()).status, "installed");
    const registered = { ...data.user };
    await integration.setEnabled(false, true);
    assert.deepEqual(data.user, registered);
    assert.equal((await moved.state()).status, "installed");
    await moved.setEnabled(false, true);
    assert.equal((await moved.state()).status, "off");
  });
});

test("replaced junctions survive uninstall while their PATH entry is removed and the conflict reported", async () => {
  await fixture(async ({ integration, root, data }) => {
    const original = { ...data.user };
    await integration.setEnabled(true);
    await unlink(integration.junction);
    await mkdir(integration.junction);
    await writeFile(path.join(integration.junction, "keep.txt"), "user data");
    const result = await integration.setEnabled(false, true);
    assert.equal(result.status, "off");
    assert.match(result.conflict!, /Another file/);
    assert.deepEqual(data.user, original);
    assert.equal(await readFile(path.join(integration.junction, "keep.txt"), "utf8"), "user data");
  });
});

test("damaged ownership cannot trap Settings or uninstall in a registered state; uncertain files stay", async () => {
  for (const uninstall of [false, true]) await fixture(async ({ integration, data }) => {
    const original = { ...data.user };
    await integration.setEnabled(true);
    await writeFile(integration.record, "damaged owner");
    assert.equal((await integration.state()).status, "broken");
    await assert.rejects(integration.setEnabled(true), /unrecognized/);
    const result = await integration.setEnabled(false, uninstall);
    assert.equal(result.status, "off");
    assert.match(result.conflict!, /unrecognized/);
    assert.deepEqual(data.user, original);
    assert.deepEqual(await integration.state(), result);
    assert.equal(await readFile(integration.record, "utf8"), "damaged owner");
    assert.equal(await readFile(integration.shim, "utf8"), CLI_SHIM);
    assert.ok((await lstat(integration.junction)).isSymbolicLink());
  });
});

test("the exact shim preserves quoted Unicode arguments, binary stdin/stdout and nonzero exit status", { skip: process.platform !== "win32" }, async () => {
  await fixture(async ({ integration, exe, app, root }) => {
    // A disposable Node executable stands in for RunAsNode; no Electron/profile or real PATH.
    await copyFile(process.execPath, exe);
    await writeFile(path.join(app, "resources", "cli", "cli.mjs"),
      'const chunks=[]; for await (const chunk of process.stdin) chunks.push(chunk); process.stdout.write(Buffer.concat(chunks)); process.stdout.write("\\n"+JSON.stringify(process.argv.slice(2))); process.stderr.write("probe stderr"); process.exitCode=37;');
    await integration.setEnabled(true);
    const args = ["한글 문서 😀.md", 'a "quoted" value', "C:\\space ! & (x)\\", ""];
    const input = Buffer.from([0, 255, 13, 10, 65, 0, 66]);
    const env = { ...process.env };
    for (const key of Object.keys(env)) if (["path", "nodefaultcurrentdirectoryinexepath"].includes(key.toLowerCase())) delete env[key];
    env.Path = `${integration.bin};${process.env.PATH ?? ""}`;
    for (const command of [integration.shim, "litzio"]) {
      const result = spawnSync(process.env.ComSpec ?? "cmd.exe", windowsCommand(command, args), {
        // The terminal's document folder must not contain the stand-in Litzio.exe: cmd
        // legitimately searches cwd before PATH on Windows, which would bypass any shim.
        cwd: root, env, windowsVerbatimArguments: true, windowsHide: true, input, timeout: 15_000,
      });
      assert.equal(result.status, 37, `${command}: ${result.stderr?.toString()}`);
      assert.deepEqual(result.stdout, Buffer.concat([input, Buffer.from(`\n${JSON.stringify(args)}`)]));
      assert.equal(result.stderr.toString(), "probe stderr");
    }
  });
});
