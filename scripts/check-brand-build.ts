// CI-only: change exactly the packager's configuration, then build/install both identities together.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { brand } from "../brand.ts";
import { packageConfiguration } from "../apps/desktop/scripts/package.ts";

if (process.platform !== "win32" || process.env.CI !== "true") throw new Error("Brand packaging/install proof runs only in disposable Windows CI");
const repo = path.resolve(import.meta.dirname, "..");
const work = path.join(repo, "tmp/brand-build");
mkdirSync(work, { recursive: true });
const sourceFile = path.join(repo, "brand.ts"), source = readFileSync(sourceFile, "utf8");
const version = JSON.parse(readFileSync(path.join(repo, "apps/desktop/package.json"), "utf8")).version as string;
copyFileSync(path.join(repo, "apps/desktop/release", `${brand.executableName}-Setup-${version}.exe`), path.join(work, "official-setup.exe"));
const pluginHashes = Object.fromEntries(["manifest.json", "worker.cjs", "ui.mjs", "ui.css"].map(file => [file,
  createHash("sha256").update(readFileSync(path.join(repo, "apps/desktop/build/cli/docling-worker", file))).digest("hex")]));
const iconHash = createHash("sha256").update(readFileSync(path.join(repo, brand.icons.ico))).digest("hex");
writeFileSync(path.join(work, "official.json"), JSON.stringify({ brand, config: packageConfiguration(version, false), pluginHashes, iconHash }));
const alternate = {
  ...brand, name: { en: "Brand Proof", ko: "브랜드 검증" },
  icons: { svg: "tmp/brand-build/alternate.svg", ico: "tmp/brand-build/alternate.ico" },
  appId: "io.github.litzio.brandproof", appName: "brandproof", executableName: "BrandProof", protocol: "brandproof",
  folders: { desktopData: "brandproof-data", cli: "brandproof-cli", shared: ".brandproof", plugins: "extensions" },
  cliCommand: "brandproof", storagePrefix: "brandproof",
  updates: { repository: { owner: "brandproof", repo: "distribution" }, channels: { stable: "proof-stable", beta: "proof-beta" } },
  officialPluginsUrl: "https://example.invalid/brandproof/plugins.json",
};
for (const key of ["appId", "appName", "protocol", "cliCommand", "storagePrefix"] as const) assert.notEqual(alternate[key], brand[key]);
for (const key of ["desktopData", "cli", "shared"] as const) assert.notEqual(alternate.folders[key], brand.folders[key]);
writeFileSync(path.join(work, "alternate.svg"), readFileSync(path.join(repo, brand.icons.svg), "utf8").replaceAll("Litzio", alternate.name.en).replaceAll("#083b66", "#4d2a85"));
try {
  writeFileSync(sourceFile, `/** Alternate CI packager configuration. */\nexport const brand = ${JSON.stringify(alternate, null, 2)} as const;\n` + source.slice(source.indexOf("export function productName")));
  const verify = `pnpm --filter @litzio/desktop exec tsx scripts/verify-release.ts --tag v${version}`;
  // Prove fresh default folders before updater relaunches can initialize them. NSIS relaunch
  // need not inherit test-only environment overrides; keep the coinstallation guard intact.
  for (const command of ["pnpm --filter @litzio/desktop icons", "pnpm --filter @litzio/desktop package", verify, "pnpm --filter @litzio/desktop exec tsx --test test/packaged/brand.e2e.ts"]) {
    execSync(command, { cwd: repo, stdio: "inherit", windowsHide: true });
  }
  for (const channel of ["stable", "beta"]) execSync("pnpm --filter @litzio/desktop test:update", {
    cwd: repo, stdio: "inherit", windowsHide: true, env: { ...process.env, LITZIO_TEST_UPDATE_CHANNEL: channel },
  });
  for (const command of ["pnpm --filter @litzio/desktop package", verify, "pnpm --filter @litzio/desktop test:packaged", "pnpm --filter @litzio/desktop test:uninstall"]) {
    execSync(command, { cwd: repo, stdio: "inherit", windowsHide: true });
  }
} finally {
  writeFileSync(sourceFile, source);
}
