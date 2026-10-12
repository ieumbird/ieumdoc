// electron-updater's real NsisUpdater and GitHub provider, against a local stand-in for GitHub
// Releases: the release feed, the latest full release and release assets. Which update a channel
// gets, downgrades, checksums and signatures are decided by the library, as in the installed app;
// only Electron (the app object and network stack) is replaced. Real GitHub serves the latest full
// release at /OWNER/REPO/releases/latest; for another host the provider asks the
// /api/v3/repos/OWNER/REPO/releases/latest form this stand-in answers. Selection is the same code.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import http, { type RequestOptions } from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { configureRequestOptions, configureRequestUrl, HttpExecutor, type DownloadOptions } from "builder-util-runtime";
import electronUpdater from "electron-updater";
import type { ReleaseChannel, UpdateState } from "../../editor/shared/desktop-bridge.ts";
import { configureUpdater, RELEASE_REPOSITORY } from "../src/update-policy.ts";
import { UpdateController, type UpdaterPort, type UpdateControllerOptions } from "../src/updates.ts";
import { verifyUpdateSignature } from "../src/signatures.ts";

const { NsisUpdater } = electronUpdater;
const { owner, repo } = RELEASE_REPOSITORY;

/** Node's http in place of Electron's net; downloads still go through the library's checksum path. */
class NodeHttpExecutor extends HttpExecutor<http.ClientRequest> {
  createRequest(options: RequestOptions, callback: (response: http.IncomingMessage) => void): http.ClientRequest {
    // The library sets request timeouts on the socket. Node's keep-alive agent would reuse one
    // socket across this mock feed and accumulate those listeners; Electron uses its own net API.
    return http.request({ ...options, agent: false }, callback);
  }

  download(url: URL, destination: string, options: DownloadOptions): Promise<string> {
    return options.cancellationToken.createPromise((resolve, reject, onCancel) => {
      const requestOptions: RequestOptions = { headers: options.headers || undefined };
      configureRequestUrl(url, requestOptions);
      configureRequestOptions(requestOptions);
      this.doDownload(requestOptions, {
        destination, options, onCancel, responseHandler: null,
        callback: (error) => (error == null ? resolve(destination) : reject(error)),
      }, 0);
    });
  }
}

type Release = { tag: string; prerelease?: boolean; channelFile?: "latest" | "beta"; tamper?: boolean };
const installerName = (version: string) => `IeumDoc-Setup-${version}.exe`;
const installerBytes = (version: string) => Buffer.from(`IeumDoc installer ${version}\n`.repeat(64));
const sha512 = (bytes: Buffer) => createHash("sha512").update(bytes).digest("base64");

/** Update metadata as electron-builder writes it: Beta versions publish beta.yml, Stable latest.yml. */
function channelFile(version: string): string {
  const bytes = installerBytes(version);
  return [`version: ${version}`, "files:", `  - url: ${installerName(version)}`, `    sha512: ${sha512(bytes)}`, `    size: ${bytes.length}`,
    `path: ${installerName(version)}`, `sha512: ${sha512(bytes)}`, "releaseDate: '2026-10-12T00:00:00.000Z'", ""].join("\n");
}

type GitHub = { url: string; requests: string[]; delay: (ms: number) => void; fail: (on: boolean) => void; close(): Promise<void> };

/** Releases newest first, as GitHub lists them. `latest` overrides which release GitHub marks Latest. */
async function gitHub(releases: Release[], latest?: string): Promise<GitHub> {
  const requests: string[] = [];
  let delayMs = 0;
  let failing = false;
  const server = http.createServer((request, response) => {
    const url = request.url ?? "";
    requests.push(url);
    const reply = () => {
      if (failing) return response.writeHead(503).end("unavailable");
      if (url === `/${owner}/${repo}/releases.atom`) {
        const entries = releases.map((release) => `<entry><id>tag:github.com,2008:Repository/1/${release.tag}</id>` +
          `<link rel="alternate" type="text/html" href="https://github.com/${owner}/${repo}/releases/tag/${release.tag}"/>` +
          `<title>${release.tag}</title><content type="html">Notes for ${release.tag}</content></entry>`).join("");
        return response.writeHead(200, { "Content-Type": "application/atom+xml" }).end(`<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">${entries}</feed>`);
      }
      if (url === `/api/v3/repos/${owner}/${repo}/releases/latest`) {
        const tag = latest ?? releases.find((release) => !release.prerelease)?.tag;
        return tag ? response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ tag_name: tag }))
          : response.writeHead(404).end();
      }
      const asset = new RegExp(`^/${owner}/${repo}/releases/download/([^/]+)/([^/]+)$`).exec(url);
      const release = asset && releases.find((candidate) => candidate.tag === asset[1]);
      if (release) {
        const version = release.tag.slice(1);
        const file = release.channelFile ?? (release.prerelease ? "beta" : "latest");
        if (asset![2] === `${file}.yml`) return response.writeHead(200).end(channelFile(version));
        if (asset![2] === installerName(version)) {
          const bytes = installerBytes(version);
          if (release.tamper) bytes[10] ^= 1;
          return response.writeHead(200, { "Content-Length": bytes.length }).end(bytes);
        }
      }
      response.writeHead(404).end();
    };
    if (delayMs) setTimeout(reply, delayMs);
    else reply();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `127.0.0.1:${port}`, requests,
    delay: (ms) => { delayMs = ms; },
    fail: (on) => { failing = on; },
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

const folders: string[] = [];
after(() => { for (const folder of folders) rmSync(folder, { recursive: true, force: true }); });

/** The real updater, as the installed app (app-update.yml from electron-builder) would create it. */
function realUpdater(installed: string, host: string, options: { publisherName?: string; folder?: string } = {}) {
  const folder = options.folder ?? mkdtempSync(path.join(os.tmpdir(), "ieumdoc-updater-test-"));
  if (!options.folder) folders.push(folder);
  const config = path.join(folder, "app-update.yml");
  writeFileSync(config, [`owner: ${owner}`, `repo: ${repo}`, "provider: github", "updaterCacheDirName: ieumdoc-updater-test",
    ...(options.publisherName ? [`publisherName:`, `  - ${options.publisherName}`] : []), ""].join("\n"));
  const app = { version: installed, name: "ieumdoc", isPackaged: true, appUpdateConfigPath: config, userDataPath: folder,
    baseCachePath: path.join(folder, "cache"), whenReady: () => Promise.resolve(), relaunch() {}, quit() {}, onQuit() {} };
  const updater = new NsisUpdater(null, app as never);
  (updater as unknown as { httpExecutor: HttpExecutor<http.ClientRequest> }).httpExecutor = new NodeHttpExecutor();
  updater.logger = null;
  updater.disableDifferentialDownload = true;
  updater.setFeedURL({ provider: "github", owner, repo, host, protocol: "http" } as never);
  return { updater, folder };
}

function controller(updater: InstanceType<typeof NsisUpdater>, installed: string, channel: ReleaseChannel, verifyDownloaded?: UpdateControllerOptions["verifyDownloaded"]) {
  const states: UpdateState[] = [];
  const saved: ReleaseChannel[] = [];
  const instance = new UpdateController(updater as unknown as UpdaterPort, {
    installed, channel, emit: (state) => states.push(state), saveChannel: (value) => saved.push(value),
    timers: { set: () => 0, clear: () => {} },
    ...(verifyDownloaded ? { verifyDownloaded } : {}),
  });
  return { instance, states, saved };
}

test("configured updater never downloads by itself or installs on quit", async () => {
  const github = await gitHub([{ tag: "v0.2.0" }]);
  try {
    const { updater } = realUpdater("0.1.0", github.url);
    const { instance } = controller(updater, "0.1.0", "stable");
    assert.equal(updater.autoDownload, false);
    assert.equal(updater.autoInstallOnAppQuit, false);
    await instance.check();
    assert.deepEqual(instance.state, { phase: "available", version: "0.2.0", prerelease: false });
    assert.equal(github.requests.some((url) => url.endsWith(".exe")), false, "finding an update downloads nothing");
  } finally {
    await github.close();
  }
});

test("Stable gets only full releases, even when a Beta is newer", async () => {
  const github = await gitHub([{ tag: "v0.3.0-beta.1", prerelease: true }, { tag: "v0.2.0" }]);
  try {
    const older = controller(realUpdater("0.1.0", github.url).updater, "0.1.0", "stable");
    await older.instance.check();
    assert.deepEqual(older.instance.state, { phase: "available", version: "0.2.0", prerelease: false });
    const current = controller(realUpdater("0.2.0", github.url).updater, "0.2.0", "stable");
    await current.instance.check();
    assert.deepEqual(current.instance.state, { phase: "up-to-date", latest: "0.2.0" });
  } finally {
    await github.close();
  }
});

test("Beta gets the newest Beta, then the Stable release that follows it", async () => {
  const beta = await gitHub([{ tag: "v0.3.0-beta.1", prerelease: true }, { tag: "v0.2.0" }]);
  try {
    const { instance } = controller(realUpdater("0.2.0", beta.url).updater, "0.2.0", "beta");
    await instance.check();
    assert.deepEqual(instance.state, { phase: "available", version: "0.3.0-beta.1", prerelease: true });
  } finally {
    await beta.close();
  }
  // A Stable release carries latest.yml only; the Beta channel falls back to it.
  const stable = await gitHub([{ tag: "v0.3.0" }, { tag: "v0.3.0-beta.1", prerelease: true }, { tag: "v0.2.0" }]);
  try {
    const { instance } = controller(realUpdater("0.3.0-beta.1", stable.url).updater, "0.3.0-beta.1", "beta");
    await instance.check();
    assert.deepEqual(instance.state, { phase: "available", version: "0.3.0", prerelease: false });
  } finally {
    await stable.close();
  }
});

test("switching Beta to Stable never installs an older Stable, unlike the updater's channel default", async () => {
  const github = await gitHub([{ tag: "v0.3.0-beta.2", prerelease: true }, { tag: "v0.2.0" }]);
  try {
    // The trap: setting `channel` turns allowDowngrade on, so 0.2.0 would be offered over 0.3.0-beta.2.
    const raw = realUpdater("0.3.0-beta.2", github.url).updater;
    raw.autoDownload = false;
    raw.channel = "latest";
    raw.allowPrerelease = false;
    assert.equal(raw.allowDowngrade, true);
    assert.equal((await raw.checkForUpdates())?.isUpdateAvailable, true, "the library default would downgrade");

    const { updater } = realUpdater("0.3.0-beta.2", github.url);
    const { instance, saved } = controller(updater, "0.3.0-beta.2", "beta");
    await instance.check();
    assert.equal(instance.state.phase, "up-to-date");
    await instance.setChannel("stable");
    assert.deepEqual(saved, ["stable"]);
    assert.equal(updater.allowDowngrade, false);
    assert.equal(updater.allowPrerelease, false);
    assert.deepEqual(instance.state, { phase: "up-to-date", latest: "0.2.0" }, "the newest Stable is reported, not offered");
  } finally {
    await github.close();
  }
});

test("a newer installed version ignores older releases on either channel", async () => {
  const github = await gitHub([{ tag: "v0.3.0" }, { tag: "v0.3.0-beta.1", prerelease: true }]);
  try {
    for (const channel of ["stable", "beta"] as const) {
      const { instance } = controller(realUpdater("0.4.0-beta.1", github.url).updater, "0.4.0-beta.1", channel);
      await instance.check();
      assert.deepEqual(instance.state, { phase: "up-to-date", latest: "0.3.0" }, channel);
    }
  } finally {
    await github.close();
  }
});

test("a Beta release marked Latest by mistake offers Stable users nothing", async () => {
  // As packaged, the Beta release has beta.yml only: the Stable check finds no latest.yml and fails closed.
  const packaged = await gitHub([{ tag: "v0.3.0-beta.1", prerelease: true }, { tag: "v0.2.0" }], "v0.3.0-beta.1");
  try {
    const { instance } = controller(realUpdater("0.2.0", packaged.url).updater, "0.2.0", "stable");
    await instance.check();
    assert.equal(instance.state.phase, "error");
  } finally {
    await packaged.close();
  }
  // Even a Beta whose metadata is named latest.yml is refused by the channel policy.
  const misnamed = await gitHub([{ tag: "v0.3.0-beta.1", prerelease: true, channelFile: "latest" }, { tag: "v0.2.0" }], "v0.3.0-beta.1");
  try {
    const { instance } = controller(realUpdater("0.2.0", misnamed.url).updater, "0.2.0", "stable");
    await instance.check();
    assert.deepEqual(instance.state, { phase: "up-to-date", latest: "0.3.0-beta.1" });
  } finally {
    await misnamed.close();
  }
});

test("downloads only after asking, verify the checksum, and reuse a verified download", async () => {
  const github = await gitHub([{ tag: "v0.2.0" }]);
  const verified: string[] = [];
  const verifyDownloaded = async (files: unknown) => {
    assert.ok(Array.isArray(files) && files.length === 1 && typeof files[0] === "string");
    verified.push(files[0]);
  };
  try {
    const { updater, folder } = realUpdater("0.1.0", github.url);
    const { instance, states } = controller(updater, "0.1.0", "stable", verifyDownloaded);
    await instance.check();
    await instance.download();
    assert.deepEqual(instance.state, { phase: "downloaded", version: "0.2.0", prerelease: false });
    assert.ok(states.some((state) => state.phase === "downloading"), "progress is reported while downloading");
    assert.equal(github.requests.filter((url) => url.endsWith(".exe")).length, 1);
    // A later session finds the same verified file in the updater cache and does not fetch it again.
    const again = controller(realUpdater("0.1.0", github.url, { folder }).updater, "0.1.0", "stable", verifyDownloaded);
    await again.instance.check();
    await again.instance.download();
    assert.equal(again.instance.state.phase, "downloaded");
    assert.equal(github.requests.filter((url) => url.endsWith(".exe")).length, 1);
    assert.equal(verified.length, 2, "fresh and cached downloads both pass the app's verification");
    assert.equal(verified[0], verified[1], "the cached installer path is actually reused");
  } finally {
    await github.close();
  }
});

test("a tampered installer is rejected and nothing is offered for installing", async () => {
  const github = await gitHub([{ tag: "v0.2.0", tamper: true }]);
  try {
    const { instance } = controller(realUpdater("0.1.0", github.url).updater, "0.1.0", "stable");
    await instance.check();
    await instance.download();
    assert.equal(instance.state.phase, "error");
    assert.equal(instance.state.phase === "error" && instance.state.during, "download");
    assert.match(instance.state.phase === "error" ? instance.state.message : "", /sha512 checksum mismatch/);
    assert.equal(instance.beginInstall(), null);
  } finally {
    await github.close();
  }
});

test("an installer not signed by the app's publisher is rejected", async () => {
  const github = await gitHub([{ tag: "v0.2.0" }]);
  try {
    const { updater } = realUpdater("0.1.0", github.url, { publisherName: "IeumDoc" });
    const checked: string[][] = [];
    updater.verifyUpdateCodeSignature = async (publishers, file) => {
      checked.push(publishers);
      return process.platform === "win32" ? verifyUpdateSignature(publishers, file) : "signed by someone else";
    };
    const { instance } = controller(updater, "0.1.0", "stable");
    await instance.check();
    await instance.download();
    assert.deepEqual(checked, [["IeumDoc"]]);
    assert.equal(instance.state.phase, "error");
    assert.match(instance.state.phase === "error" ? instance.state.message : "", /not signed by the application owner/);
  } finally {
    await github.close();
  }
});

test("an unavailable GitHub is an error that a later check recovers from", async () => {
  const github = await gitHub([{ tag: "v0.2.0" }]);
  try {
    const { instance } = controller(realUpdater("0.1.0", github.url).updater, "0.1.0", "stable");
    github.fail(true);
    await instance.check();
    assert.equal(instance.state.phase === "error" && instance.state.during, "check");
    github.fail(false);
    await instance.check();
    assert.deepEqual(instance.state, { phase: "available", version: "0.2.0", prerelease: false });
  } finally {
    await github.close();
  }
});

test("a check that started before a channel change does not decide the new channel", async () => {
  const github = await gitHub([{ tag: "v0.3.0-beta.1", prerelease: true }, { tag: "v0.2.0" }]);
  try {
    const { updater } = realUpdater("0.2.0", github.url);
    const { instance, states } = controller(updater, "0.2.0", "beta");
    github.delay(200);
    const first = instance.check();
    await instance.setChannel("stable");
    await first;
    // Wait for the check the channel change queued.
    while (instance.state.phase === "checking") await new Promise((resolve) => setTimeout(resolve, 20));
    assert.deepEqual(instance.state, { phase: "up-to-date", latest: "0.2.0" });
    assert.equal(states.some((state) => state.phase === "available"), false, "the Beta result from before the change is never shown");
  } finally {
    await github.close();
  }
});

test("configureUpdater sets the channel before turning downgrades off", () => {
  const settings = { channel: null as string | null, allowPrerelease: true, allowDowngrade: false, autoDownload: true, autoInstallOnAppQuit: true,
    disableWebInstaller: false, fullChangelog: true };
  // The library's channel setter turns allowDowngrade on; it must end off.
  const updater = new Proxy(settings, { set(target, key, value) {
    (target as Record<string | symbol, unknown>)[key] = value;
    if (key === "channel") target.allowDowngrade = true;
    return true;
  } });
  configureUpdater(updater, "stable");
  assert.deepEqual(settings, { channel: "latest", allowPrerelease: false, allowDowngrade: false, autoDownload: false, autoInstallOnAppQuit: false,
    disableWebInstaller: true, fullChangelog: false });
});
