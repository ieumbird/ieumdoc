// Package the staged app as the per-user Windows x64 NSIS installer with its update metadata.
//   pnpm --filter @ieumdoc/desktop package             local build; unsigned unless CSC_LINK is set
//   IEUMDOC_RELEASE=1 pnpm --filter @ieumdoc/desktop package
//     release build: fails unless Windows code signing succeeds, and the app refuses updates
//     that are not signed by the same publisher.
// Nothing is published: the release workflow uploads the verified artifacts.
import path from "node:path";
import { rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Arch, build, Platform, type Configuration } from "electron-builder";
import semver from "semver";
import { RELEASE_REPOSITORY } from "../src/update-policy.ts";
import { appVersion, buildDesktop } from "./build.ts";

const desktop = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** The update metadata a version publishes: `beta.yml` for a Beta, `latest.yml` for a Stable release. */
export function updateChannelOf(appVersion: string): "latest" | "beta" {
  const prerelease = semver.prerelease(appVersion);
  if (prerelease && prerelease[0] !== "beta") throw new Error(`Version ${appVersion} is neither Stable nor Beta`);
  return prerelease ? "beta" : "latest";
}

/**
 * Where the app looks for updates: GitHub Releases. The update test alone points its builds at a
 * local stand-in (IEUMDOC_TEST_UPDATE_HOST); a release build refuses it.
 */
function publishTarget(appVersion: string, release: boolean, testHost = process.env.IEUMDOC_TEST_UPDATE_HOST) {
  if (testHost && release) throw new Error("IEUMDOC_TEST_UPDATE_HOST cannot be used for a release build");
  return { provider: "github" as const, owner: RELEASE_REPOSITORY.owner, repo: RELEASE_REPOSITORY.repo, channel: updateChannelOf(appVersion),
    ...(testHost ? { host: testHost, protocol: "http" as const } : {}) };
}

export function packageConfiguration(appVersion: string, release: boolean): Configuration {
  return {
    // Identity of the installed app: never change after the first public release.
    appId: "io.github.ieumbird.ieumdoc",
    productName: "IeumDoc",
    copyright: "Copyright © 2026 IeumDoc contributors",
    directories: { app: "build/app", output: "release" },
    files: ["**/*"],
    asar: true,
    npmRebuild: false,
    electronLanguages: ["en-US", "ko"],
    forceCodeSigning: release,
    // GitHub provider: the metadata file is named by this channel only.
    detectUpdateChannel: false,
    generateUpdatesFilesForAllChannels: false,
    publish: [publishTarget(appVersion, release)],
    win: { target: [{ target: "nsis", arch: ["x64"] }], icon: "assets/icon.ico" },
    nsis: {
      installerIcon: "assets/icon.ico",
      uninstallerIcon: "assets/icon.ico",
      // Per-user, no administrator rights, installed and updated without a wizard.
      oneClick: true,
      perMachine: false,
      allowElevation: false,
      deleteAppDataOnUninstall: false,
      artifactName: "IeumDoc-Setup-${version}.${ext}",
      shortcutName: "IeumDoc",
    },
  };
}

async function main(): Promise<void> {
  const release = process.env.IEUMDOC_RELEASE === "1";
  if (release && process.env.IEUMDOC_REQUIRE_SIGNED_UPDATES !== "1") process.env.IEUMDOC_REQUIRE_SIGNED_UPDATES = "1";
  await buildDesktop();
  // This fixed child folder contains generated artifacts only. Old test feeds/versions and
  // channel files must never be mixed into another build.
  const output = path.join(desktop, "release");
  if (path.dirname(output) !== desktop) throw new Error("Packaging output must stay in apps/desktop");
  rmSync(output, { recursive: true, force: true });
  await build({
    projectDir: desktop,
    targets: Platform.WINDOWS.createTarget(["nsis"], Arch.x64),
    config: packageConfiguration(appVersion(), release),
    publish: "never",
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
