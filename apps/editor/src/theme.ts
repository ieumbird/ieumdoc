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
  const desktop = window.litzioDesktop;
  if (!desktop) return;
  // Keep the color value in tokens.css, including the native window's unpainted background.
  const style = getComputedStyle(root);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const context = canvas.getContext("2d")!;
  const color = (role: string) => {
    // Let the browser parse CSS (including minified #fff), then send opaque sRGB bytes.
    context.fillStyle = style.getPropertyValue(`--id-color-${role}`).trim();
    context.fillRect(0, 0, 1, 1);
    return "#" + [...context.getImageData(0, 0, 1, 1).data].slice(0, 3)
      .map(value => value.toString(16).padStart(2, "0")).join("");
  };
  return desktop.setWindowBackground(color("canvas"), {
    color: color("surface-subtle"),
    symbolColor: color("text"),
  });
}

export async function applyTheme(theme: ThemePreference): Promise<void> {
  preference = theme;
  const request = ++revision;
  render(theme === "dark" || (theme === "system" && media.matches));
  const desktop = window.litzioDesktop;
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
