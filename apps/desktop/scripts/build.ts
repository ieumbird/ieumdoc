// Stage the desktop app in build/app: the Editor's production build, the bundled main process and
// preload, and the sample document. The staged folder needs no node_modules and no Vite at run time.
// IEUMDOC_REQUIRE_SIGNED_UPDATES=1 (release builds) makes the app refuse updates it cannot verify.
// Runtime libraries (electron-updater, semver) are bundled here, so they are devDependencies and
// electron-builder copies no node_modules into the app.
import { execSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const desktop = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repo = path.resolve(desktop, "../..");
const stage = path.join(desktop, "build", "app");
const manifest = JSON.parse(readFileSync(path.join(desktop, "package.json"), "utf8")) as {
  productName: string; version: string; description: string; author: string; license: string;
};

/** The app version: package.json's, or IEUMDOC_TEST_VERSION for the update test's builds only. */
export function appVersion(): string {
  const override = process.env.IEUMDOC_TEST_VERSION;
  if (!override) return manifest.version;
  if (process.env.IEUMDOC_RELEASE === "1") throw new Error("IEUMDOC_TEST_VERSION cannot be used for a release build");
  return override;
}

export async function buildDesktop(): Promise<string> {
  rmSync(stage, { recursive: true, force: true });
  mkdirSync(stage, { recursive: true });

  execSync("pnpm --filter @ieumdoc/editor build", { cwd: repo, stdio: ["ignore", "inherit", "inherit"] });
  const editorBuild = path.join(repo, "apps", "editor", "dist");
  if (!existsSync(path.join(editorBuild, "index.html"))) throw new Error("The Editor build has no index.html");
  cpSync(editorBuild, path.join(stage, "editor"), { recursive: true });

  const requireSigned = process.env.IEUMDOC_REQUIRE_SIGNED_UPDATES === "1";
  await build({
    entryPoints: [path.join(desktop, "src", "main.ts")],
    outfile: path.join(stage, "main.mjs"),
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    external: ["electron"],
    define: { __IEUMDOC_REQUIRE_SIGNED_UPDATES__: String(requireSigned) },
    // Bundled CommonJS dependencies (electron-updater) load `electron` and Node modules with require.
    banner: { js: 'import { createRequire as __ieumdocCreateRequire } from "node:module"; const require = __ieumdocCreateRequire(import.meta.url);' },
    legalComments: "none",
    logLevel: "warning",
  });
  // A sandboxed preload is a CommonJS script that can load only `electron`.
  await build({
    entryPoints: [path.join(desktop, "src", "preload.ts")],
    outfile: path.join(stage, "preload.cjs"),
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node22",
    external: ["electron"],
    logLevel: "warning",
  });

  mkdirSync(path.join(stage, "sample"));
  for (const file of ["technical-document.md", "diagram.svg"]) {
    cpSync(path.join(repo, "apps", "editor", "document", file), path.join(stage, "sample", file));
  }
  // The app's own package.json: its name decides the user data and updater cache folders. Keep it.
  writeFileSync(path.join(stage, "package.json"), `${JSON.stringify({
    name: "ieumdoc",
    productName: manifest.productName,
    version: appVersion(),
    description: manifest.description,
    author: manifest.author,
    license: manifest.license,
    type: "module",
    main: "main.mjs",
  }, null, 2)}\n`);
  console.log(`staged ${manifest.productName} ${appVersion()} in ${path.relative(repo, stage)}${requireSigned ? " (signed updates required)" : ""}`);
  return stage;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await buildDesktop();
