// Destructive to a disposable account only. CI runs this after building the actual NSIS package.
import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { CliIntegration } from "../../src/cli-integration.ts";
import { windowsEnvironment } from "../../src/windows-environment.ts";

const desktop = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const work = path.resolve(desktop, "../../tmp/desktop-uninstall");
const local = process.env.LOCALAPPDATA!;
const logFolder = path.join(local, "Litzio", "uninstall-logs");
const bin = path.join(local, "Litzio", "bin");
const environment = windowsEnvironment();
function entries(): string {
  return execFileSync("powershell.exe", ["-NoProfile", "-Command",
    "$key = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall'; " +
    "if (Test-Path -LiteralPath $key) { Get-ChildItem -LiteralPath $key -ErrorAction Stop | " +
    "ForEach-Object { Get-ItemProperty $_.PSPath -ErrorAction Stop } | Where-Object { $_.DisplayName -like 'Litzio*' } | ForEach-Object { $_.UninstallString } }"], { encoding: "utf8" }).trim();
}

test("NSIS removal cleans owned CLI entries, preserves user files and survives optional cleanup failures", {
  skip: process.platform !== "win32" || process.env.CI !== "true", timeout: 10 * 60_000,
}, async () => {
  assert.equal(entries(), "", "requires an uninstalled disposable Windows account");
  assert.ok(!existsSync(bin) || readdirSync(bin).length === 0, "existing CLI files must not be changed");
  assert.ok(!existsSync(logFolder), "existing uninstall logs must not be changed");
  const original = (await environment.read()).user;
  const longPath = { value: `${original.value};${'C:\\한글 도구\\"quoted";%VAR%\\bin;;'.repeat(180)}`, kind: "ExpandString" as const };
  assert.ok(longPath.value.length > 4000);
  const version = JSON.parse(readFileSync(path.join(desktop, "package.json"), "utf8")).version;
  const installer = path.join(desktop, "release", `Litzio-Setup-${version}.exe`);
  mkdirSync(work, { recursive: true });
  try {
    await environment.write(original, longPath);
    assert.deepEqual((await environment.read()).user, longPath, "long raw Unicode/quote/variable PATH round-trips");
    // A stale snapshot must fail without overwriting the longer value.
    await assert.rejects(environment.write(original, original), /User PATH changed/);
    assert.deepEqual((await environment.read()).user, longPath);
    for (const silent of [false, true]) for (const fault of ["empty", "user", "owner", "foreign", "helper", "environment"] as const) {
      const healthy = fault === "empty" || fault === "user";
      if (healthy && !silent) continue;
      const label = `${silent ? "silent" : "interactive"}-${fault}`;
      const install = path.join(work, label);
      const setup = spawnSync(installer, ["/S", `/D=${install}`], { timeout: 60_000, encoding: "utf8" });
      assert.equal(setup.status, 0, `${label}: ${setup.stderr}`);
      const registration = entries();
      assert.ok(registration.toLowerCase().includes(install.toLowerCase()), `${label}: registration ${registration} must identify ${install}`);
      const integration = new CliIntegration(path.join(install, "Litzio.exe"), local, environment);
      await integration.setEnabled(true);
      const registered = (await environment.read()).user;
      const userFile = path.join(bin, "user-note.txt");
      if (fault === "user") writeFileSync(userFile, "Preserve user files.\n");
      if (fault === "owner") writeFileSync(integration.record, "damaged owner");
      if (fault === "foreign") writeFileSync(integration.shim, "user owned script");
      if (fault === "helper") unlinkSync(path.join(install, "resources", "uninstall-cli.cjs"));
      const ownerBefore = readFileSync(integration.record);
      const shimBefore = readFileSync(integration.shim);
      const logsBefore = new Set(existsSync(logFolder) ? readdirSync(logFolder) : []);
      // _?= runs the real installed uninstaller without its detached self-copy. Copying it to
      // our scratch keeps its own executable outside the application tree it must remove.
      const uninstaller = path.join(work, `${label}.exe`);
      copyFileSync(path.join(install, "Uninstall Litzio.exe"), uninstaller);
      const args = [...(silent ? ["/S"] : []), "/currentuser", `_?=${install}`];
      const temporary = path.join(work, `${label}-temporary`);
      mkdirSync(temporary, { recursive: true });
      const env = { ...process.env, TEMP: temporary, TMP: temporary,
        ...(fault === "environment" ? { SystemRoot: path.join(work, "missing-windows") } : {}) };
      let status: number | null;
      if (silent) {
        const result = spawnSync(uninstaller, args, { env, encoding: "utf8", timeout: 60_000 });
        assert.ifError(result.error);
        status = result.status;
      } else {
        const child = spawn(uninstaller, args, { env, stdio: "ignore" });
        const completed = new Promise<number | null>((resolve, reject) => { child.once("error", reject); child.once("exit", resolve); });
        try {
          const output = execFileSync("powershell.exe", ["-NoProfile", "-File",
            path.join(desktop, "test/packaged/uninstall-dialogs.ps1"), String(child.pid)], { encoding: "utf8", timeout: 60_000 });
          writeFileSync(path.join(work, `${label}-dialogs.txt`), output);
          assert.match(output, /CLI cleanup incomplete/, "interactive uninstall displays the cleanup warning");
          status = await completed;
        } catch (error) {
          const failure = error as Error & { stdout?: string; stderr?: string };
          writeFileSync(path.join(work, `${label}-dialogs.txt`), `${failure.stdout ?? ""}\n${failure.stderr ?? failure.message}`);
          spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
          await completed;
          throw error;
        }
      }
      assert.equal(status, 0, `${label}: app removal must succeed despite optional cleanup failure`);
      assert.equal(entries(), "", `${label}: uninstall registration removed`);
      assert.equal(existsSync(integration.executable), false, `${label}: app executable removed`);
      if (healthy) {
        assert.deepEqual((await environment.read()).user, longPath, `${label}: only the CLI PATH entry was removed`);
        for (const entry of [integration.record, integration.shim, integration.junction])
          assert.throws(() => lstatSync(entry), { code: "ENOENT" });
        if (fault === "user") {
          assert.equal(readFileSync(userFile, "utf8"), "Preserve user files.\n");
          // Remove only this test's preserved file and empty directory after asserting the outcome.
          unlinkSync(userFile);
          rmdirSync(bin);
        } else assert.equal(existsSync(bin), false, "uninstall must remove an empty owned bin");
        assert.deepEqual(existsSync(logFolder) ? readdirSync(logFolder) : [], [...logsBefore],
          `${label}: successful cleanup, including a nonempty bin, must not report a failure`);
        console.log(`${label}: app and owned CLI entries removed; user files preserved`);
        continue;
      }
      assert.deepEqual(readFileSync(integration.record), ownerBefore, "uncertain files preserved");
      assert.deepEqual(readFileSync(integration.shim), shimBefore);
      assert.ok(lstatSync(integration.junction).isSymbolicLink(), "junction preserved, including dangling target");
      const logs = readdirSync(logFolder).filter(name => !logsBefore.has(name));
      assert.equal(logs.length, 1, `${label}: durable cleanup diagnostic`);
      const diagnostic = readFileSync(path.join(logFolder, logs[0]!)).toString("utf16le");
      writeFileSync(path.join(work, `${label}-cleanup.txt`), diagnostic);
      assert.match(diagnostic, /CLI cleanup incomplete/);
      assert.ok(diagnostic.includes(bin));
      assert.match(diagnostic, /Environment Variables > User Path/);
      assert.match(diagnostic, fault === "owner" ? /ownership file is unrecognized/
        : fault === "foreign" ? /Another file already uses/
        : fault === "helper" ? /Cleanup helper is missing/ : /powershell\.exe.*ENOENT|ENOENT.*powershell\.exe/s,
      `${label}: diagnostic identifies the injected failure`);
      const expected = fault === "owner" || fault === "foreign" ? longPath : registered;
      assert.deepEqual((await environment.read()).user, expected, `${label}: report actual PATH outcome`);
      await environment.write(expected, longPath);
      // Only fixture entries, whose unchanged contents and identity were just verified.
      unlinkSync(integration.junction); unlinkSync(integration.shim); unlinkSync(integration.record);
      console.log(`${label}: app removed; warning recorded; uncertain files preserved`);
    }
  } finally {
    await environment.write((await environment.read()).user, original);
  }
  assert.deepEqual((await environment.read()).user, original);
});
