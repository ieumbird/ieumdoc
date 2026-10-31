import { brand } from "../../../brand.ts";
// Check packaged release artifacts before anything is uploaded:
//   tsx scripts/verify-release.ts --tag v0.3.0-beta.1 [--signed]
// The tag must name the app version and be Stable (vX.Y.Z) or Beta (vX.Y.Z-beta.N). The update
// metadata must be the channel's only file and describe the installer exactly (version, name, size,
// sha512). The app must update from this repository's GitHub Releases. With --signed, the installer
// and app must carry a valid Authenticode signature and the app must name its publisher, so that it
// accepts only updates from the same publisher. Prints the files to upload, one per line.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import { gunzipSync } from "node:zlib";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { load } from "js-yaml";
import { RELEASE_REPOSITORY, releaseIdentity } from "../src/update-policy.ts";
import { readSignatureSync, signatureProblem } from "../src/signatures.ts";

const desktop = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Reuse the pinned builder's chunker; never implement a second blockmap/checksum algorithm. */
export async function verifyBlockmap(installer: string, blockmap: string): Promise<void> {
  const require = createRequire(import.meta.url);
  const builder = createRequire(require.resolve("electron-builder"));
  const { buildBlockMap } = builder("app-builder-lib/out/targets/blockmap/blockmap.js") as {
    buildBlockMap(input: string, format: "gzip", output: string): Promise<unknown>;
  };
  const temp = mkdtempSync(path.join(os.tmpdir(), "litzio-blockmap-"));
  try {
    const expected = path.join(temp, "expected.blockmap");
    await buildBlockMap(installer, "gzip", expected);
    if (!gunzipSync(readFileSync(blockmap)).equals(gunzipSync(readFileSync(expected)))) throw new Error("Installer blockmap does not match the installer");
  } finally { rmSync(temp, { recursive: true, force: true }); }
}

/** Read PE resources without executing either binary. FileVersion retains the Beta identifier. */
export function verifyExecutableVersions(release: string, version: string): void {
  if (process.platform !== "win32") throw new Error("Executable version verification requires Windows");
  const exe = path.join(process.env.SystemRoot ?? "C:\\Windows", "System32/WindowsPowerShell/v1.0/powershell.exe");
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.toLowerCase() === "psmodulepath") delete env[key];
  for (const file of [path.join(release, `${brand.executableName}-Setup-${version}.exe`), path.join(release, `win-unpacked/${brand.executableName}.exe`)]) {
    const actual = execFileSync(exe, ["-NoProfile", "-NonInteractive", "-Command",
      `$ErrorActionPreference = 'Stop'; (Get-Item -LiteralPath '${file.replaceAll("'", "''")}').VersionInfo.FileVersion`],
      { env, encoding: "utf8", timeout: 20_000, windowsHide: true }).trim();
    if (actual !== version) throw new Error(`${path.basename(file)} FileVersion ${actual} differs from ${version}`);
  }
}

/** Use the existing YAML library; malformed/duplicate keys must not be interpreted differently. */
export function readUpdateInfo(text: string): Record<string, unknown> {
  const values: unknown = load(text);
  if (typeof values !== "object" || values === null || Array.isArray(values)) throw new Error("Update metadata must be a YAML mapping");
  return values as Record<string, unknown>;
}

export function verifyRelease(options: { tag: string; release: string; signed: boolean; version: string }): string[] {
  const problems: string[] = [];
  const fail = (message: string) => problems.push(message);
  const identity = releaseIdentity(options.tag, options.version);
  const installer = path.join(options.release, `${brand.executableName}-Setup-${identity.version}.exe`);
  const blockmap = `${installer}.blockmap`;
  const channelFile = path.join(options.release, `${brand.updates.channels[identity.channel]}.yml`);
  const otherFile = path.join(options.release, `${brand.updates.channels[identity.channel === "beta" ? "stable" : "beta"]}.yml`);
  const appExe = path.join(options.release, "win-unpacked", `${brand.executableName}.exe`);
  for (const file of [installer, blockmap, channelFile, appExe]) if (!existsSync(file)) fail(`missing ${path.basename(file)}`);
  if (existsSync(blockmap) && statSync(blockmap).size === 0) fail("installer blockmap is empty");
  // A Beta must never publish latest.yml: Stable users read only that file.
  if (existsSync(otherFile)) fail(`${path.basename(otherFile)} must not be published with a ${identity.channel} release`);

  if (existsSync(installer) && existsSync(channelFile)) {
    const bytes = readFileSync(installer);
    const sha512 = createHash("sha512").update(bytes).digest("base64");
    const info = readUpdateInfo(readFileSync(channelFile, "utf8"));
    const files = info.files;
    if (!Array.isArray(files) || files.length !== 1 || typeof files[0] !== "object" || files[0] === null) {
      fail(`${path.basename(channelFile)} must describe exactly one installer`);
    }
    const file = Array.isArray(files) ? files[0] as Record<string, unknown> | undefined : undefined;
    const name = path.basename(installer);
    if (info.version !== identity.version) fail(`${path.basename(channelFile)} names version ${info.version}, not ${identity.version}`);
    if (info.path !== name || file?.url !== name) fail(`${path.basename(channelFile)} does not name ${name}`);
    if (info.sha512 !== sha512 || file?.sha512 !== sha512) fail(`${path.basename(channelFile)} sha512 does not match ${name}`);
    if (file?.size !== statSync(installer).size) fail(`${path.basename(channelFile)} size does not match ${name}`);
  }

  const appUpdate = path.join(options.release, "win-unpacked", "resources", "app-update.yml");
  let publishers: string[] = [];
  if (!existsSync(appUpdate)) {
    fail("missing win-unpacked/resources/app-update.yml");
  } else {
    const config = readUpdateInfo(readFileSync(appUpdate, "utf8"));
    if (config.provider !== "github" || config.owner !== RELEASE_REPOSITORY.owner || config.repo !== RELEASE_REPOSITORY.repo) {
      fail(`the app updates from ${config.provider} ${config.owner}/${config.repo}, not GitHub ${RELEASE_REPOSITORY.owner}/${RELEASE_REPOSITORY.repo}`);
    }
    if (config.host || config.protocol) fail("the app updates from a test host, not github.com");
    if (config.updaterCacheDirName !== `${brand.appName}-updater`) fail(`unexpected updaterCacheDirName ${config.updaterCacheDirName}`);
    const names = typeof config.publisherName === "string" ? [config.publisherName] : config.publisherName;
    if (Array.isArray(names) && names.every((name) => typeof name === "string" && name.trim())) publishers = names;
    if (options.signed && !publishers.length) fail("the app names no publisher to verify updates against");
  }

  if (options.signed) {
    for (const file of [installer, appExe]) {
      if (!existsSync(file)) continue;
      try {
        const problem = signatureProblem(publishers, file, readSignatureSync(file));
        if (problem) fail(`${path.basename(file)} ${problem}`);
      } catch (error) {
        fail(`${path.basename(file)} signature verification failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
  if (problems.length) throw new Error(`Release ${options.tag} is not publishable:\n- ${problems.join("\n- ")}`);
  return [installer, blockmap, channelFile];
}

/** Deliver exactly the verified installer/metadata and unpacked app, including custom channels. */
export function writeReleaseArtifactPaths(files: readonly string[], release: string, outputFile: string): void {
  appendFileSync(outputFile, `paths<<LITZIO_RELEASE_ARTIFACTS\n${[...files, path.join(release, "win-unpacked")].join("\n")}\nLITZIO_RELEASE_ARTIFACTS\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const tag = args[args.indexOf("--tag") + 1];
  if (!args.includes("--tag") || !tag) throw new Error("Usage: verify-release.ts --tag vX.Y.Z[-beta.N] [--signed | --identity-only]");
  const { version } = JSON.parse(readFileSync(path.join(desktop, "package.json"), "utf8")) as { version: string };
  if (args.includes("--identity-only")) console.log(JSON.stringify(releaseIdentity(tag, version)));
  else {
    const files = verifyRelease({ tag, release: path.join(desktop, "release"), signed: args.includes("--signed"), version });
    verifyExecutableVersions(path.join(desktop, "release"), version);
    await verifyBlockmap(files[0]!, files[1]!);
    if (process.env.GITHUB_OUTPUT) writeReleaseArtifactPaths(files, path.join(desktop, "release"), process.env.GITHUB_OUTPUT);
    for (const file of files) console.log(path.relative(process.cwd(), file));
  }
}
