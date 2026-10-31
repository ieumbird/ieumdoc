/** Packager-owned product identity. Internal @litzio/* packages and Host APIs never depend on it. */
export const brand = {
  name: { en: "Litzio", ko: "Litzio" },
  icons: {
    png: "apps/desktop/assets/litzio-icon-1024.png",
    smallPng: "apps/desktop/assets/litzio-icon-small-1024.png",
    ico: "apps/desktop/assets/icon.ico",
  },
  appId: "io.github.litzio.litzio",
  appName: "litzio",
  executableName: "Litzio",
  protocol: "litzio",
  // appName is also the one-click install directory and updater-cache prefix.
  folders: { desktopData: "litzio", cli: "litzio", shared: ".litzio", plugins: "plugins" },
  cliCommand: "litzio",
  storagePrefix: "litzio",
  updates: {
    repository: { owner: "litzio", repo: "litzio" },
    channels: { stable: "latest", beta: "beta" },
  },
  // No official plugin catalog is published yet. Its installer is subsequent ADR-0012 work.
  officialPluginsUrl: null as string | null,
} as const;

export function productName(language: string = "en"): string {
  return language.startsWith("ko") ? brand.name.ko : brand.name.en;
}
