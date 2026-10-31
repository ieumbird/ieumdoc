import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PLUGIN_UI } from "@litzio/plugin-api/config";

/** Trusted, synthetic UI bundle; deliberately no Editor import or conversion. */
export function uiPluginFixture(root: string) {
  let version = 0;
  return {
    document: path.join(root, "document.md"),
    write(mode: "ready" | "render-error" | "load-error") {
      mkdirSync(root, { recursive: true });
      writeFileSync(path.join(root, PLUGIN_UI.script), `
        ${mode === "load-error" ? 'throw new Error("PLUGIN_UI_LOAD_FIXTURE");' : ""}
        globalThis.__uiFixtureEvaluations = (globalThis.__uiFixtureEvaluations ?? 0) + 1;
        export function activate(host) {
          globalThis.__uiFixtureActivations = (globalThis.__uiFixtureActivations ?? 0) + 1;
          function View() {
            ${mode === "render-error" ? 'throw new Error("PLUGIN_UI_RENDER_FIXTURE");' : ""}
            const [count, setCount] = host.React.useState(0);
            host.React.useEffect(() => {
              globalThis.__uiFixtureMounted = (globalThis.__uiFixtureMounted ?? 0) + 1;
              return () => { globalThis.__uiFixtureMounted--; };
            }, []);
            return host.jsx.jsx("button", { onClick: () => setCount(count + 1), children: "Fixture count " + count });
          }
          return {
            commands: [{ id: "open", label: "Fixture command", run: () => host.openTab("view", "fixture") }],
            sidebar: [{ id: "open", label: "Fixture sidebar", run: () => host.openTab("view", "fixture") }],
            tabs: [{ id: "view", label: "Fixture view", open: async () => ({ path: "fixture/view/document.md", data: {} }), View }],
            dispose() {
              globalThis.__uiFixtureDisposals = (globalThis.__uiFixtureDisposals ?? 0) + 1;
              (globalThis.__uiFixtureMountedAtDispose ??= []).push(globalThis.__uiFixtureMounted ?? 0);
            }
          };
        }
      `);
      writeFileSync(path.join(root, PLUGIN_UI.style), "/* fixture styles */");
      const manifest = path.join(root, "manifest.json");
      writeFileSync(manifest, JSON.stringify({ id: "fixture", version: String(++version), ui: {
        api: PLUGIN_UI.api, reactMajor: PLUGIN_UI.reactMajor, script: PLUGIN_UI.script, style: PLUGIN_UI.style,
      } }));
      return manifest;
    },
  };
}
