/** Replaced with literals by the CLI build. Source/tsx runs have no build identity. */
declare const __IEUMDOC_CLI_BUILD__: { version: string; desktop: boolean; commit: string };
const identity = typeof __IEUMDOC_CLI_BUILD__ === "undefined"
  ? { version: "development", desktop: false, commit: "unknown" } : __IEUMDOC_CLI_BUILD__;

export function versionText(build = identity): string {
  return `ieumdoc ${build.version} (${build.desktop ? "desktop, " : ""}${build.commit})\n`;
}
