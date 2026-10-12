// App preferences in the user data folder: the release channel and a postponed update notification.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import semver from "semver";
import type { ReleaseChannel } from "../../editor/shared/desktop-bridge.ts";
import { parseChannel } from "./update-policy.ts";

export type Preferences = {
  channel: ReleaseChannel;
  /** Later on this version's notification; a newer version notifies again. */
  postponed: string | null;
};

const DEFAULTS: Preferences = { channel: "stable", postponed: null };

/** Unknown or damaged values fall back to the defaults: Stable, nothing postponed. */
export function readPreferences(file: string): Preferences {
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return { ...DEFAULTS };
  }
  const record = typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
  return {
    channel: parseChannel(record.channel),
    postponed: typeof record.postponed === "string" && semver.valid(record.postponed) ? record.postponed : null,
  };
}

/** Written beside the file and renamed over it, so an interrupted write leaves the previous preferences. */
export function writePreferences(file: string, preferences: Preferences): void {
  mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(preferences, null, 2)}\n`, "utf8");
  renameSync(temporary, file);
}
