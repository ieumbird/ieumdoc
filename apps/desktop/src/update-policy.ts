// Release channels, versions and update scheduling, without Electron or the network.
import semver from "semver";
import type { OfferedUpdate, ReleaseChannel } from "../../editor/shared/desktop-bridge.ts";

/** The GitHub repository whose Releases the app updates from. */
export const RELEASE_REPOSITORY = { owner: "ieumbird", repo: "ieumdoc" } as const;
export const RELEASES_URL = `https://github.com/${RELEASE_REPOSITORY.owner}/${RELEASE_REPOSITORY.repo}/releases`;

/** First check soon after launch, without delaying the window or the first document. */
export const FIRST_CHECK_DELAY_MS = 15_000;
/** GitHub is asked at most every 6 hours while the app runs (two small requests each time). */
export const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
/** After a failed check (offline, GitHub unavailable), try again sooner than the interval. */
export const RETRY_INTERVAL_MS = 30 * 60 * 1000;
/** The Editor has this long to answer whether it may restart; no answer means no. */
export const RESTART_CHECK_TIMEOUT_MS = 5_000;

export function parseChannel(value: unknown): ReleaseChannel {
  return value === "beta" ? "beta" : "stable";
}

/** The electron-updater settings this app relies on. */
export type UpdaterSettings = {
  channel: string | null;
  allowPrerelease: boolean;
  allowDowngrade: boolean;
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  disableWebInstaller: boolean;
  fullChangelog: boolean;
};

/**
 * Configure electron-updater for a channel. Stable reads the release GitHub marks latest (never a
 * prerelease) and its `latest.yml`; Beta reads the newest semver tag in the release feed and its
 * `beta.yml`, else `latest.yml`. Setting `channel` turns `allowDowngrade` on, and the updater starts
 * with `allowPrerelease` on when the installed version is a prerelease, so both are set afterwards:
 * switching channel never installs an older version. Downloading and installing wait for the user,
 * and quitting the app never installs an update.
 */
export function configureUpdater(updater: UpdaterSettings, channel: ReleaseChannel): void {
  updater.autoDownload = false;
  updater.autoInstallOnAppQuit = false;
  updater.disableWebInstaller = true;
  updater.fullChangelog = false;
  updater.channel = channel === "beta" ? "beta" : "latest";
  updater.allowPrerelease = channel === "beta";
  updater.allowDowngrade = false;
}

/**
 * The update a channel may offer over the installed version: only a newer version, and on Stable
 * never a prerelease. Applied to every result the updater reports, so a misconfigured release or a
 * result from before a channel change cannot offer a Beta to Stable or an older version.
 */
export function offerFor(installed: string, channel: ReleaseChannel, candidate: string): OfferedUpdate | null {
  const current = semver.parse(installed);
  const next = semver.parse(candidate);
  if (!current || !next || !semver.gt(next, current)) return null;
  const prerelease = next.prerelease.length > 0;
  if (prerelease && (channel !== "beta" || next.prerelease[0] !== "beta")) return null;
  return { version: next.version, prerelease };
}

/** A release's tag, version and channel, as the release workflow accepts them. */
export type ReleaseIdentity = { tag: string; version: string; channel: ReleaseChannel };

/**
 * `v<major>.<minor>.<patch>` is Stable; `v<major>.<minor>.<patch>-beta.<n>` is Beta. Any other tag,
 * or one that names a different version than the app, is refused.
 */
export function releaseIdentity(tag: string, appVersion: string): ReleaseIdentity {
  const match = /^v(\d+\.\d+\.\d+(?:-beta\.\d+)?)$/.exec(tag);
  const version = match ? semver.valid(match[1]) : null;
  if (!version || version !== match![1]) {
    throw new Error(`Release tag ${JSON.stringify(tag)} is not vMAJOR.MINOR.PATCH or vMAJOR.MINOR.PATCH-beta.N`);
  }
  if (version !== appVersion) throw new Error(`Release tag ${tag} does not match the app version ${appVersion}`);
  return { tag, version, channel: semver.prerelease(version) ? "beta" : "stable" };
}

/** The GitHub release page of a version the updater reported, or the releases list. */
export function releaseNotesUrl(version?: string): string {
  const parsed = version === undefined ? null : semver.valid(version);
  return parsed ? `${RELEASES_URL}/tag/v${parsed}` : RELEASES_URL;
}
