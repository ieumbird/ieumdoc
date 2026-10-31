// Build a relocatable Node CLI plus the production Editor. No source checkout or node_modules at runtime.
import { execFileSync, execSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { buildDoclingWorker } from "./build-docling-worker.ts";

const cli = fileURLToPath(new URL("..", import.meta.url));
const repo = path.resolve(cli, "../..");
const destination = path.join(cli, "dist");
const manifest = JSON.parse(readFileSync(path.join(cli, "package.json"), "utf8"));
const desktopVersion = process.env.LITZIO_CLI_DESKTOP_VERSION;
let commit = "unknown";
try { commit = execFileSync("git", ["rev-parse", "--short=12", "HEAD"], { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); }
catch { /* An exported source tree can be built without Git. */ }
// Fixed output directory, never a caller-supplied path.
rmSync(destination, { recursive: true, force: true });
mkdirSync(destination, { recursive: true });
await buildDoclingWorker(path.join(destination, "docling-worker"));
execSync("pnpm --filter @litzio/editor build", { cwd: repo, stdio: "inherit" });
cpSync(path.join(repo, "apps/editor/dist"), path.join(destination, "editor"), { recursive: true });
const result = await build({
  absWorkingDir: repo,
  entryPoints: { cli: path.join(cli, "src/cli.ts") }, outdir: destination, outExtension: { ".js": ".mjs" },
  bundle: true, splitting: true, platform: "node", format: "esm", target: "node24", metafile: true,
  define: { __LITZIO_DOCLING_DIRECTORY__: JSON.stringify("./docling-worker"), __LITZIO_CLI_BUILD__: JSON.stringify({ version: desktopVersion ?? manifest.version, desktop: desktopVersion !== undefined, commit }) },
  banner: { js: 'import { createRequire as __litzioCreateRequire } from "node:module"; const require = __litzioCreateRequire(import.meta.url);' },
  legalComments: "linked", logLevel: "warning",
});
const executable = path.join(destination, "cli.mjs");
writeFileSync(executable, `#!/usr/bin/env node\n${readFileSync(executable, "utf8")}`, { mode: 0o755 });
writeFileSync(path.join(destination, "package.json"), JSON.stringify({ name: "@litzio/cli", version: manifest.version,
  description: "IeumDoc document CLI and HTTP Editor Host", license: "MIT", type: "module", private: true,
  bin: { ieumdoc: "cli.mjs" }, files: ["*.mjs", "*.txt", "*.md", "editor/", "docling-worker/", "LICENSE"], engines: { node: ">=24.21.0 <25" } }, null, 2) + "\n");
cpSync(path.join(repo, "LICENSE"), path.join(destination, "LICENSE"));
// Include dependency license files for bundled runtime modules and the Editor assets.
const packageDirs = new Set<string>();
for (const input of Object.keys(result.metafile.inputs)) {
  let current = path.dirname(path.resolve(repo, input));
  while (current !== path.dirname(current)) {
    if (existsSync(path.join(current, "package.json"))) { packageDirs.add(current); break; }
    current = path.dirname(current);
  }
}
// Collect transitive production and peer dependencies of the Editor as well as the CLI bundle.
function collectPackage(directory: string): void {
  const real = realpathSync(directory);
  if (packageDirs.has(real)) return;
  packageDirs.add(real);
  const pkg = JSON.parse(readFileSync(path.join(real, "package.json"), "utf8"));
  for (const name of Object.keys({ ...pkg.dependencies, ...pkg.peerDependencies, ...pkg.optionalDependencies })) {
    for (let current = real; current !== path.dirname(current); current = path.dirname(current)) {
      const candidate = path.join(current, "node_modules", name);
      if (existsSync(path.join(candidate, "package.json"))) { collectPackage(candidate); break; }
    }
  }
}
collectPackage(path.join(repo, "apps/editor"));
const notices = [...packageDirs].sort().map(directory => {
  const pkg = JSON.parse(readFileSync(path.join(directory, "package.json"), "utf8"));
  const licenses = readdirSync(directory).filter(name => /^(license|licence|copying|notice)(\.|$)/i.test(name));
  return `${pkg.name}@${pkg.version} (${typeof pkg.license === "string" ? pkg.license : "see package license"})\n` +
    licenses.map(name => readFileSync(path.join(directory, name), "utf8")).join("\n");
});
writeFileSync(path.join(destination, "THIRD_PARTY_LICENSES.txt"), notices.join("\n\n--------------------\n\n"));
writeFileSync(path.join(destination, "README.md"), "# IeumDoc CLI and HTTP Editor\n\nRequires Node.js >=24.21.0 <25.\n\n`ieumdoc --version` alone prints the build version and commit (or unknown without Git).\n\nRun `ieumdoc serve --root <folder> [--root <folder>]` after local package installation, or `node cli.mjs serve --root <folder>`.\n\nDefault: http://127.0.0.1:5180. Roots are allowed server folders, selected individually with Open Folder. No built-in authentication. Use an access-controlled reverse proxy and `--public-origin` for remote access. See https://github.com/ieumbird/ieumdoc/blob/master/docs/design/http-host-v1.md for the security and deployment contract.\n");
console.log(`CLI and Editor built in ${path.relative(repo, destination)}`);
