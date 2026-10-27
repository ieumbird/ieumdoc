import { readAccentColor, readPageBackground, readTheme, type PageBackground, type ThemePreference } from "./preferences.ts";
import "./styles/tokens.css";

// Runtime counterpart of theme-init.js: keep roles and native appearance in sync before UI mounts.
const root = document.documentElement;
const media = window.matchMedia("(prefers-color-scheme: dark)");
let preference = readTheme();
let revision = 0;

export const currentTheme = (): ThemePreference => preference;

function render(dark: boolean): void {
  root.dataset.theme = dark ? "dark" : "light";
  root.style.removeProperty("color-scheme");
}

function syncBackground(): Promise<void> | undefined {
  // Keep the color value in tokens.css, including the native window's unpainted background.
  return window.ieumdocDesktop?.setWindowBackground(getComputedStyle(root).getPropertyValue("--id-color-canvas").trim());
}

export async function applyTheme(theme: ThemePreference): Promise<void> {
  preference = theme;
  const request = ++revision;
  render(theme === "dark" || (theme === "system" && media.matches));
  const desktop = window.ieumdocDesktop;
  if (desktop) {
    // Electron's explicit theme also overrides matchMedia. Reset nativeTheme first when
    // returning to System, then use its actual answer, not the previous override's match.
    const dark = await desktop.setTheme(theme);
    if (request !== revision) return;
    render(dark);
    await syncBackground();
  }
}

export function applyPageBackground(page: PageBackground): void {
  root.dataset.page = page;
  void syncBackground();
}

root.dataset.page = readPageBackground();
root.dataset.accent = readAccentColor();
export const themeReady = applyTheme(preference);
const systemChanged = () => {
  if (preference !== "system") return;
  render(media.matches);
  void syncBackground();
};
media.addEventListener("change", systemChanged);
if (import.meta.hot) import.meta.hot.dispose(() => media.removeEventListener("change", systemChanged));
