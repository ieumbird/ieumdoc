// Execute actual packaged-test helpers with in-memory OS ports. Never package or install locally.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import { transformSync } from "esbuild";
import { UUID } from "builder-util-runtime";
import { brand } from "../../../brand.ts";

for (const channel of ["stable", "beta"] as const) test(`update packaging and installed-app lookup follow a different ${channel} build identity`, () => {
  const alternate = { ...brand, name: { en: "Brand Proof", ko: "브랜드 검증" }, appId: "io.github.litzio.brandproof", appName: "brandproof", executableName: "BrandProof", cliCommand: "brandproof",
    updates: { ...brand.updates, channels: { stable: "proof-stable", beta: "proof-beta" } } };
  const copied: string[] = [];
  const installed = String.raw`C:\owned app`;
  const key = `HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${UUID.v5(alternate.appId, UUID.parse("50e065bc-3134-11e6-9bab-38c9862bdaf3"))}`;
  const load = (file: URL, expose = "") => {
    const module = { exports: {} as any }, require = createRequire(file);
    const source = transformSync(readFileSync(file, "utf8") + expose, { loader: "ts", format: "cjs", define: { "import.meta.url": JSON.stringify(file.href) } }).code;
    runInNewContext(source, { module, exports: module.exports, process: { argv: [], env: { APPDATA: "C:/appdata", LOCALAPPDATA: "C:/local", LITZIO_TEST_UPDATE_CHANNEL: channel } }, console,
      require(name: string): unknown {
        if (name.endsWith("/brand.ts")) return { brand: alternate };
        if (name === "node:fs") return { rmSync() {}, mkdirSync() {}, copyFileSync(from: string) { copied.push(path.basename(from)); } };
        if (name === "node:child_process") return { execFileSync(file: string, args: string[]) {
          if (file !== "powershell" && file !== "powershell.exe") return "";
          return args.at(-1)!.includes(key) ? `"${installed}\\Uninstall BrandProof.exe"` : "";
        } };
        if (name === "node:test") return { test() {} };
        if (name === "@playwright/test") return {};
        if (name === "../../scripts/verify-release.ts" || name === "../../src/preferences.ts" || name === "./cli-check.ts") return {};
        if (name === "../../src/update-policy.ts") return { RELEASE_REPOSITORY: alternate.updates.repository };
        if (name === "../../src/windows-environment.ts") return { windowsEnvironment: () => ({}) };
        if (name === "./installed-app.ts") return load(new URL("./packaged/installed-app.ts", import.meta.url));
        return require(name);
      },
    });
    return module.exports;
  };
  const helpers = load(new URL("./packaged/update.e2e.ts", import.meta.url), "\nexport { packageVersion, installedEntry };\n");
  const version = channel === "beta" ? "0.2.0-beta.1" : "0.2.0";
  helpers.packageVersion(version);
  assert.deepEqual(copied, [`BrandProof-Setup-${version}.exe`, `BrandProof-Setup-${version}.exe.blockmap`, `proof-${channel}.yml`]);
  assert.equal(helpers.installedEntry(), installed);
});
