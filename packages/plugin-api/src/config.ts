/** Litzio protocol identifiers, independent of product branding. Branding must never change these. */
export const PLUGIN_UI = {
  api: 1, reactMajor: 19, route: "/api/ui-plugins", script: "ui.mjs", style: "ui.css",
} as const;
export type UiManifest = { api: number; reactMajor: number; script: typeof PLUGIN_UI.script; style?: typeof PLUGIN_UI.style };
export type UiRegistration = { id: string; revision: string; ui: UiManifest };
