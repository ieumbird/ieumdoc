import * as React from "react";
import * as jsx from "react/jsx-runtime";
import { flushSync } from "react-dom";
import { PLUGIN_UI, type UiRegistration } from "@document-plugins/api/config";
import type { UiHost, UiModule } from "@document-plugins/api/ui";
import { ReadOnlyDocument } from "./ReadOnlyDocument.tsx";
import { Button } from "./components/ui/button.tsx";
import { i18n, type MessageKey } from "./i18n.ts";
import { UiRegistry, type ActiveUi } from "./plugin-ui-registry.ts";

type ShellApi = Pick<UiHost, "pickFolder" | "openTab" | "showPdfConversion">;
function PluginButton(props: { children?: React.ReactNode; onClick(): void; disabled?: boolean }) {
  return <Button size="sm" variant="ghost" {...props} />;
}
async function load(registration: UiRegistration, signal: AbortSignal) {
  const url = (asset: string) => `${import.meta.env.BASE_URL}${PLUGIN_UI.route.slice(1)}?${new URLSearchParams({ id: registration.id, revision: registration.revision, asset })}`;
  let link: HTMLLinkElement | undefined;
  try {
    if (registration.ui.style) {
      link = document.createElement("link"); link.rel = "stylesheet"; link.href = url(registration.ui.style);
      await new Promise<void>((resolve, reject) => {
        const finish = (error?: Error) => {
          signal.removeEventListener("abort", abort); link!.onload = null; link!.onerror = null;
          error ? reject(error) : resolve();
        };
        const abort = () => finish(new Error("UI loading stopped."));
        link!.onload = () => finish(); link!.onerror = () => finish(new Error("Plugin stylesheet failed to load."));
        signal.addEventListener("abort", abort, { once: true });
        document.head.append(link!);
      });
    }
    const module: UiModule = await import(/* @vite-ignore */ url(registration.ui.script));
    return { module, release: () => link?.remove() };
  } catch (error) { link?.remove(); throw error; }
}
/** Content-addressed URLs reuse native ESM records on re-registration. No
 * activation counters, global bridge, eval or second React copy. */
export function usePluginUi(shellApi: ShellApi) {
  const api = React.useRef(shellApi); api.current = shellApi;
  const [plugins, setPlugins] = React.useState<ActiveUi[]>([]);
  const [observed, setObserved] = React.useState(false);
  const [problem, setProblem] = React.useState("");
  React.useEffect(() => {
    let stopped = false, timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    const registry = new UiRegistry(React.version, states => flushSync(() => setPlugins(states)), load,
      (registration, guard, signal): UiHost => ({
        api: PLUGIN_UI.api, React, jsx, ReadingSurface: ReadOnlyDocument, Button: PluginButton,
        text: key => i18n.t(key as MessageKey),
        readJson: async (route, query) => {
          guard();
          if (!/^api\/[a-z0-9-]+$/u.test(route)) throw new Error("Invalid Host read route.");
          const response = await fetch(`${import.meta.env.BASE_URL}${route}?${new URLSearchParams(query)}`, { signal });
          const value = await response.json(); guard();
          if (!response.ok) throw new Error(value.error ?? "Host read failed.");
          return value;
        },
        imageUrl: (path, uri) => `${import.meta.env.BASE_URL}document/${uri.split("/").map(encodeURIComponent).join("/")}?${new URLSearchParams({ path })}`,
        pickFolder: (options, focus) => { guard(); api.current.pickFolder(options, focus); },
        openTab: (kind, resource) => { guard(); return api.current.openTab(`${registration.id}/${kind}`, resource); },
        showPdfConversion: focus => { guard(); api.current.showPdfConversion(focus); },
      }), error => setProblem(String(error)));
    const observe = async () => {
      try {
        const response = await fetch(`${import.meta.env.BASE_URL}${PLUGIN_UI.route.slice(1)}`, { signal: controller.signal, cache: "no-store" });
        if (!response.ok) throw new Error("Could not read UI plugin registrations.");
        const registrations: UiRegistration[] = await response.json();
        if (!stopped) { registry.reconcile(registrations); setProblem(""); setObserved(true); }
      } catch (error) {
        if (!stopped) { registry.reconcile([]); setProblem(String(error)); }
      } finally { if (!stopped) timer = setTimeout(observe, 500); }
    };
    void observe();
    return () => { stopped = true; controller.abort(); clearTimeout(timer); registry.close(); };
  }, []);
  return { plugins, problem, observed };
}
