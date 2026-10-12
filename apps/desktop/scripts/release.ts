// The manual workflow's controller. Preflight uses only Node built-ins, before running tag code.
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type ReleaseMode = "verify" | "unsigned-beta" | "signed";
const repository = "ieumbird/ieumdoc";
const canonicalTag = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-beta\.(0|[1-9]\d*))?$/;

export function releaseMode(mode: string, tag: string): ReleaseMode {
  if (!["verify", "unsigned-beta", "signed"].includes(mode)) throw new Error("Unknown release mode");
  if (canonicalTag.exec(tag)?.[0] !== tag) throw new Error("Invalid release tag: expected vX.Y.Z[-beta.N]");
  if (mode === "unsigned-beta" && !tag.includes("-beta.")) throw new Error("Unsigned publication is restricted to Beta tags");
  return mode as ReleaseMode;
}

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "pipe"] }).trim();
}

export function checkRemoteTag(cwd: string, tag: string, commit: string): void {
  const refs = git(cwd, ["ls-remote", "--tags", "origin", `refs/tags/${tag}`, `refs/tags/${tag}^{}`]);
  const rows = new Map(refs.split("\n").filter(Boolean).map((row) => row.split(/\s+/) as [string, string]).map(([sha, ref]) => [ref, sha]));
  if ((rows.get(`refs/tags/${tag}^{}`) ?? rows.get(`refs/tags/${tag}`)) !== commit) throw new Error("Remote release tag is missing or changed");
}

export function resolveRelease(cwd: string, tag: string, mode: string, trusted: string) {
  releaseMode(mode, tag);
  if (!/^[a-f0-9]{40}$/.test(trusted) || git(cwd, ["rev-parse", "HEAD"]) !== trusted) throw new Error("Controller must run from the trusted master dispatch commit");
  const commit = git(cwd, ["rev-parse", "--verify", `refs/tags/${tag}^{commit}`]);
  const ancestry = spawnSync("git", ["merge-base", "--is-ancestor", commit, trusted], { cwd, windowsHide: true });
  if (ancestry.status !== 0) throw new Error("Release tag is not in the trusted master history");
  const manifest = JSON.parse(git(cwd, ["show", `${commit}:apps/desktop/package.json`])) as { version?: string };
  if (manifest.version !== tag.slice(1)) throw new Error("Tag and Desktop package version differ");
  checkRemoteTag(cwd, tag, commit);
  return { commit, version: manifest.version, mode: releaseMode(mode, tag) };
}

type Asset = { name: string; size: number; digest: string; state: string };
type Release = { id: number; tag_name: string; prerelease: boolean; draft: boolean; assets: Asset[]; html_url?: string };
export type ReleaseApi = (endpoint: string, method?: "GET" | "POST" | "PATCH", body?: object, file?: string) => unknown;

export const githubApi: ReleaseApi = (endpoint, method = "GET", body, file) => {
  const args = ["api", endpoint, "--method", method, "-H", "X-GitHub-Api-Version: 2022-11-28"];
  if (file) args.push("-H", "Content-Type: application/octet-stream", "--input", file);
  else if (body) args.push("--input", "-");
  return JSON.parse(execFileSync("gh", args, { input: body ? JSON.stringify(body) : undefined, encoding: "utf8", windowsHide: true }));
};

export function refuseExistingRelease(tag: string, api: ReleaseApi): void {
  // The by-tag endpoint excludes Drafts. Paginate the authenticated list, which includes them.
  for (let page = 1; ; page++) {
    const releases = api(`repos/${repository}/releases?per_page=100&page=${page}`);
    if (!Array.isArray(releases)) throw new Error("Could not verify existing Releases");
    if (releases.some((release) => release.tag_name === tag)) throw new Error("A Release or Draft already exists; nothing will be overwritten");
    if (releases.length < 100) return;
  }
}

export function publishVerifiedRelease(options: { tag: string; mode: string; files: string[]; beforeActivate(): void }, api: ReleaseApi): Release {
  const mode = releaseMode(options.mode, options.tag);
  if (mode === "verify") throw new Error("Verification mode cannot publish");
  const beta = options.tag.includes("-beta.");
  const version = options.tag.slice(1);
  const expected = [`IeumDoc-Setup-${version}.exe`, `IeumDoc-Setup-${version}.exe.blockmap`, beta ? "beta.yml" : "latest.yml"].sort();
  const files = options.files.map((file) => ({ file, name: path.basename(file), size: statSync(file).size,
    digest: `sha256:${createHash("sha256").update(readFileSync(file)).digest("hex")}` }));
  if (JSON.stringify(files.map((file) => file.name).sort()) !== JSON.stringify(expected)) throw new Error("Unexpected publication assets");
  refuseExistingRelease(options.tag, api);
  const draft = api(`repos/${repository}/releases`, "POST", {
    tag_name: options.tag, name: `IeumDoc ${version}`, draft: true, prerelease: beta, make_latest: "false", generate_release_notes: true,
    ...(mode === "unsigned-beta" ? { body: "Unsigned Windows Beta. Windows may show publisher or SmartScreen warnings. SHA-512 checks file integrity; it does not authenticate the publisher." } : {}),
  }) as Release;
  if (!Number.isSafeInteger(draft.id) || draft.id < 1) throw new Error("Draft creation returned no release ID; inspect GitHub before retrying");
  const endpoint = `repos/${repository}/releases/${draft.id}`;
  const properties = (release: Release, isDraft: boolean) => {
    if (release.id !== draft.id || release.tag_name !== options.tag || release.draft !== isDraft || release.prerelease !== beta) throw new Error("Release properties differ from the requested release");
  };
  try {
    properties(draft, true);
    if (!Array.isArray(draft.assets) || draft.assets.length) throw new Error("New Draft already contains assets");
    for (const file of files) {
      api(`https://uploads.github.com/repos/${repository}/releases/${draft.id}/assets?name=${encodeURIComponent(file.name)}`, "POST", undefined, file.file);
    }
    const uploaded = api(endpoint) as Release;
    properties(uploaded, true);
    if (!Array.isArray(uploaded.assets) || JSON.stringify(uploaded.assets.map((asset) => asset.name).sort()) !== JSON.stringify(expected)) throw new Error("Uploaded asset set differs");
    for (const file of files) {
      const asset = uploaded.assets.find((asset) => asset.name === file.name)!;
      if (asset.state !== "uploaded" || asset.size !== file.size || asset.digest !== file.digest) throw new Error(`Uploaded asset size/hash/state differs: ${file.name}`);
    }
    options.beforeActivate();
  } catch (error) {
    throw new Error(`Release ${draft.id} remains Draft (${draft.html_url ?? endpoint}): ${error instanceof Error ? error.message : error}`);
  }
  // Only this final request makes the verified Draft public. A transport failure here is
  // ambiguous: the server may have applied it. Never retry/create/delete automatically.
  try {
    const published = api(endpoint, "PATCH", { draft: false, prerelease: beta, make_latest: beta ? "false" : "true" }) as Release;
    properties(published, false);
    return published;
  } catch (error) {
    throw new Error(`Publication confirmation required for Release ${draft.id}; inspect GitHub before retrying: ${error instanceof Error ? error.message : error}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const value = (name: string) => { const index = args.indexOf(name); if (index < 0 || !args[index + 1]) throw new Error(`Missing ${name}`); return args[index + 1]!; };
  const cwd = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
  const tag = value("--tag");
  const mode = value("--mode");
  const trusted = value("--trusted");
  const identity = resolveRelease(cwd, tag, mode, trusted);
  if (args[0] === "preflight") {
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `commit=${identity.commit}\nversion=${identity.version}\n`);
    console.log(JSON.stringify(identity));
  } else if (args[0] === "publish") {
    if (process.env.GITHUB_REPOSITORY !== repository) throw new Error("Publication repository differs from the update repository");
    if (identity.commit !== value("--commit")) throw new Error("Release tag changed after build");
    const { verifyRelease, verifyExecutableVersions, verifyBlockmap } = await import("./verify-release.ts");
    const release = path.join(cwd, "apps/desktop/release");
    const files = verifyRelease({ tag, version: identity.version, release, signed: mode === "signed" });
    verifyExecutableVersions(release, identity.version);
    await verifyBlockmap(files[0]!, files[1]!);
    console.log(JSON.stringify(publishVerifiedRelease({ tag, mode, files, beforeActivate: () => checkRemoteTag(cwd, tag, identity.commit) }, githubApi)));
  } else throw new Error("Expected preflight or publish command");
}
