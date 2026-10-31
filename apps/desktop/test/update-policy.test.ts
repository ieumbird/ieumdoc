import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import type { UpdateState } from "../../editor/shared/desktop-bridge.ts";
import { packageConfiguration, updateChannelOf } from "../scripts/package.ts";
import { readPreferences, writePreferences } from "../src/preferences.ts";
import { CHECK_INTERVAL_MS, FIRST_CHECK_DELAY_MS, offerFor, parseChannel, releaseIdentity, releaseNotesUrl, RETRY_INTERVAL_MS } from "../src/update-policy.ts";
import { UpdateController, type UpdaterPort } from "../src/updates.ts";

test("a channel offers only newer versions; Stable never a prerelease", () => {
  const cases: [string, "stable" | "beta", string, string | null][] = [
    ["0.2.0", "stable", "0.3.0", "0.3.0"],
    ["0.2.0", "stable", "0.3.0-beta.1", null],
    ["0.2.0", "beta", "0.3.0-beta.1", "0.3.0-beta.1"],
    ["0.3.0-beta.1", "beta", "0.3.0-beta.2", "0.3.0-beta.2"],
    ["0.3.0-beta.2", "beta", "0.3.0", "0.3.0"],
    ["0.3.0-beta.2", "stable", "0.3.0", "0.3.0"],
    ["0.3.0-beta.2", "stable", "0.2.0", null],
    ["0.3.0", "beta", "0.3.0", null],
    ["0.3.0", "beta", "0.3.0-beta.9", null],
    ["0.2.0", "beta", "0.3.0-alpha.1", null],
    ["0.2.0", "beta", "not-a-version", null],
  ];
  for (const [installed, channel, candidate, expected] of cases) {
    assert.equal(offerFor(installed, channel, candidate)?.version ?? null, expected, `${installed} ${channel} ${candidate}`);
  }
  assert.deepEqual(offerFor("0.2.0", "beta", "0.3.0-beta.1"), { version: "0.3.0-beta.1", prerelease: true });
});

test("release tags name the app version and are Stable or Beta only", () => {
  assert.deepEqual(releaseIdentity("v0.2.0", "0.2.0"), { tag: "v0.2.0", version: "0.2.0", channel: "stable" });
  assert.deepEqual(releaseIdentity("v0.3.0-beta.2", "0.3.0-beta.2"), { tag: "v0.3.0-beta.2", version: "0.3.0-beta.2", channel: "beta" });
  for (const tag of ["0.2.0", "v0.2", "v0.3.0-rc.1", "v0.3.0-beta", "v0.3.0-beta.1+build", "v01.2.3", "v0.2.0 "]) {
    assert.throws(() => releaseIdentity(tag, tag.replace(/^v/, "")), /is not vMAJOR/, tag);
  }
  assert.throws(() => releaseIdentity("v0.2.1", "0.2.0"), /does not match the app version 0.2.0/);
});

test("packaging names the update metadata by channel and requires signing for releases", () => {
  assert.equal(updateChannelOf("0.2.0"), "latest");
  assert.equal(updateChannelOf("0.3.0-beta.1"), "beta");
  assert.throws(() => updateChannelOf("0.3.0-rc.1"), /neither Stable nor Beta/);
  const local = packageConfiguration("0.3.0-beta.1", false);
  assert.equal(local.forceCodeSigning, false);
  assert.deepEqual(local.publish, [{ provider: "github", owner: "ieumbird", repo: "ieumdoc", channel: "beta" }]);
  assert.equal(packageConfiguration("0.3.0", true).forceCodeSigning, true);
  assert.equal(local.appId, "io.github.litzio.litzio");
  assert.deepEqual([local.nsis?.oneClick, local.nsis?.perMachine], [true, false]);
});

test("release notes links stay on the repository's releases", () => {
  assert.equal(releaseNotesUrl("0.3.0-beta.1"), "https://github.com/ieumbird/ieumdoc/releases/tag/v0.3.0-beta.1");
  assert.equal(releaseNotesUrl(), "https://github.com/ieumbird/ieumdoc/releases");
  assert.equal(releaseNotesUrl("../../evil"), "https://github.com/ieumbird/ieumdoc/releases");
});

test("preferences follow the installed channel by default and preserve a saved choice across versions", () => {
  const folder = mkdtempSync(path.join(os.tmpdir(), "litzio-preferences-"));
  try {
    const file = path.join(folder, "preferences.json");
    const installs = [["0.0.1", "stable"], ["0.0.1-beta.1", "beta"]] as const;
    for (const [version, channel] of installs) {
      rmSync(file, { force: true });
      assert.deepEqual(readPreferences(file, version), { channel, seenUpdate: null }, `first launch of ${version}`);
      writeFileSync(file, "{ not json");
      assert.deepEqual(readPreferences(file, version), { channel, seenUpdate: null }, `damaged preferences on ${version}`);
      writeFileSync(file, JSON.stringify({ channel: "nightly", seenUpdate: "../x" }));
      assert.deepEqual(readPreferences(file, version), { channel, seenUpdate: null }, `invalid channel on ${version}`);
      writeFileSync(file, JSON.stringify({ seenUpdate: "0.0.1-beta.2" }));
      assert.deepEqual(readPreferences(file, version), { channel, seenUpdate: "0.0.1-beta.2" }, `missing channel on ${version}`);
    }
    for (const channel of ["stable", "beta"] as const) {
      writePreferences(file, { channel, seenUpdate: "0.0.1-beta.2" });
      for (const [version] of installs) {
        assert.deepEqual(readPreferences(file, version), { channel, seenUpdate: "0.0.1-beta.2" }, `saved ${channel} on ${version}`);
      }
    }
    assert.equal(parseChannel("beta"), "beta");
    assert.equal(parseChannel(undefined), "stable");
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

/** A stand-in for electron-updater with scripted results, for the controller's own transitions. */
function fakeUpdater(results: (() => Promise<{ isUpdateAvailable: boolean; updateInfo: { version: string } }>)[]) {
  const listeners: Record<string, ((value: never) => void)[]> = {};
  const calls = { downloads: 0, installs: [] as [boolean | undefined, boolean | undefined][] };
  const updater = {
    channel: null as string | null, allowPrerelease: false, allowDowngrade: false, autoDownload: true, autoInstallOnAppQuit: true,
    disableWebInstaller: false, fullChangelog: false,
    checkForUpdates: () => results.shift()!(),
    async downloadUpdate() {
      calls.downloads++;
      for (const listener of listeners["download-progress"] ?? []) listener({ percent: 50, transferred: 5, total: 10 } as never);
      for (const listener of listeners["update-downloaded"] ?? []) listener({ version: "0.3.0" } as never);
      return [];
    },
    quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean) { calls.installs.push([isSilent, isForceRunAfter]); },
    on(event: string, listener: (value: never) => void) { (listeners[event] ??= []).push(listener); },
  };
  return { updater: updater as unknown as UpdaterPort, calls };
}

function timers() {
  const scheduled: number[] = [];
  return { scheduled, set: (_run: () => void, ms: number) => scheduled.push(ms), clear: () => {} };
}

test("checks are scheduled after launch, every interval, and sooner after a failure", async () => {
  const clock = timers();
  const { updater } = fakeUpdater([async () => { throw new Error("offline"); }, async () => ({ isUpdateAvailable: false, updateInfo: { version: "0.2.0" } })]);
  const controller = new UpdateController(updater, { installed: "0.2.0", channel: "stable", emit() {}, saveChannel() {}, timers: clock });
  controller.start();
  await controller.check();
  await controller.check();
  assert.deepEqual(clock.scheduled, [FIRST_CHECK_DELAY_MS, RETRY_INTERVAL_MS, CHECK_INTERVAL_MS]);
  assert.ok(CHECK_INTERVAL_MS >= 60 * 60 * 1000, "GitHub is not polled more than hourly");
});

test("install runs only from a downloaded update, after the Editor allowed it", async () => {
  const states: UpdateState[] = [];
  const { updater, calls } = fakeUpdater([async () => ({ isUpdateAvailable: true, updateInfo: { version: "0.3.0" } })]);
  const controller = new UpdateController(updater, { installed: "0.2.0", channel: "stable", emit: (state) => states.push(state), saveChannel() {}, timers: timers() });
  controller.finishInstall();
  assert.equal(controller.beginInstall(), null, "nothing is installed before a download");
  await controller.check();
  assert.equal(calls.downloads, 0, "finding an update downloads nothing");
  await controller.download();
  assert.deepEqual(states.find((state) => state.phase === "downloading" && state.percent === 50), { phase: "downloading", version: "0.3.0", prerelease: false, percent: 50, transferred: 5, total: 10 });
  assert.equal(controller.state.phase, "downloaded");
  controller.finishInstall();
  assert.deepEqual(calls.installs, [], "a downloaded update waits for the restart the Editor allows");
  assert.deepEqual(controller.beginInstall(), { version: "0.3.0", prerelease: false });
  controller.cancelInstall();
  assert.equal(controller.state.phase, "downloaded", "a refused restart keeps the update");
  controller.beginInstall();
  controller.finishInstall();
  assert.deepEqual(calls.installs, [[true, true]]);
  await assert.rejects(controller.setChannel("beta"), /after the current update finishes/);
});

test("a development run reports that updates run in the installed app", async () => {
  const { updater } = fakeUpdater([]);
  const clock = timers();
  const controller = new UpdateController(updater, { installed: "0.2.0", channel: "stable", unsupported: "Updates run in the installed app.", emit() {}, saveChannel() {}, timers: clock });
  controller.start();
  await controller.check();
  assert.deepEqual(clock.scheduled, []);
  assert.deepEqual(controller.state, { phase: "error", message: "Updates run in the installed app.", during: "check" });
});

test("a failed channel preference write keeps the previous channel", async () => {
  const { updater } = fakeUpdater([]);
  const controller = new UpdateController(updater, { installed: "0.2.0", channel: "stable", emit() {},
    saveChannel() { throw new Error("disk full"); }, timers: timers() });
  await assert.rejects(controller.setChannel("beta"), /disk full/);
  assert.equal(controller.channel, "stable");
  assert.equal(updater.channel, "latest");
});

test("a cached download must pass verification before it becomes installable", async () => {
  const { updater } = fakeUpdater([async () => ({ isUpdateAvailable: true, updateInfo: { version: "0.3.0" } })]);
  const controller = new UpdateController(updater, { installed: "0.2.0", channel: "stable", emit() {}, saveChannel() {}, timers: timers(),
    async verifyDownloaded() { throw new Error("signature publisher does not match"); } });
  await controller.check();
  await controller.download();
  assert.equal(controller.state.phase, "error");
  assert.equal(controller.beginInstall(), null);
  assert.match(controller.state.phase === "error" ? controller.state.message : "", /signature publisher/);
});
