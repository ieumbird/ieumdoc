// Explicit Docling-only spike, not a general extension registry.
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { useEffect, useRef, useState } from "react";
import type { UiContribution, UiHost } from "@ieumdoc/docling/ui-plugin-api";
import { ReadOnlyDocument } from "./ReadOnlyDocument.tsx";
import { Button } from "./components/ui/button.tsx";
import { i18n, type MessageKey } from "./i18n.ts";

export type PluginUiState = { status: "disabled" | "loading" | "ready" | "error"; revision: string;
  reason?: string; contribution?: UiContribution; loadMs?: number };
function CompareButton(props: { children?: React.ReactNode; onClick(): void; disabled?: boolean }) {
  return <Button size="sm" variant="ghost" {...props} />;
}
export function usePluginUi(chooseComparison: () => void): PluginUiState {
  const choose = useRef(chooseComparison); choose.current = chooseComparison;
  const [state, setState] = useState<PluginUiState>({ status: "loading", revision: "" });
  useEffect(() => {
    let stopped = false, identity = "", generation = 0, style: HTMLLinkElement | undefined;
    let timer: ReturnType<typeof setTimeout>;
    const abort = new AbortController();
    const host: UiHost = { apiVersion: 1, React, jsxRuntime, ReadingSurface: ReadOnlyDocument, Button: CompareButton,
      text: key => i18n.t(key as MessageKey), chooseComparison: () => choose.current(),
      mediaUrl: (path, uri) => `${import.meta.env.BASE_URL}document/${uri.split("/").map(encodeURIComponent).join("/")}?${new URLSearchParams({ path })}` };
    async function load(revision: string, current: number) {
      const start = performance.now();
      const asset = (name: string) => `${import.meta.env.BASE_URL}api/docling-module-ui?${new URLSearchParams({ revision, asset: name })}`;
      const link = document.createElement("link"); link.rel = "stylesheet"; link.href = asset("style"); style = link;
      try {
        const css = new Promise<void>((resolve, reject) => {
          link.onload = () => resolve(); link.onerror = () => reject(new Error("Could not load module stylesheet."));
          document.head.append(link);
        });
        const [module] = await Promise.all([import(/* @vite-ignore */ asset("script")), css]);
        if (stopped || current !== generation) return;
        const contribution = module.activate(host) as UiContribution;
        if (contribution.tab?.kind !== "docling-comparison" || typeof contribution.tab.View !== "function"
          || contribution.commands?.length !== 1 || contribution.commands[0]?.id !== "docling-compare"
          || typeof contribution.commands[0].run !== "function") throw new Error("Unsupported module contributions.");
        setState({ status: "ready", revision, contribution, loadMs: performance.now() - start });
      } catch (error) {
        link.remove();
        if (!stopped && current === generation) setState({ status: "error", revision, reason: String(error) });
      }
    }
    async function poll() {
      try {
        const response = await fetch(`${import.meta.env.BASE_URL}api/docling-module-ui`, { cache: "no-store", signal: abort.signal });
        if (!response.ok) throw new Error(`Module registration read failed (${response.status}).`);
        const descriptor = await response.json();
        if (stopped) return;
        const next = JSON.stringify(descriptor);
        if (next !== identity) {
          identity = next; generation++; style?.remove(); style = undefined;
          const revision = descriptor.revision ?? "";
          if (!descriptor.enabled) setState({ status: "disabled", revision });
          else if (descriptor.hostApiVersion !== host.apiVersion) setState({ status: "error", revision,
            reason: `UI Host API ${descriptor.hostApiVersion} is incompatible; expected ${host.apiVersion}.` });
          else { setState({ status: "loading", revision }); void load(revision, generation); }
        }
      } catch (error) {
        if (!stopped) { identity = ""; generation++; style?.remove(); setState({ status: "error", revision: "", reason: String(error) }); }
      } finally { if (!stopped) timer = setTimeout(() => void poll(), 500); }
    }
    void poll();
    return () => { stopped = true; generation++; abort.abort(); clearTimeout(timer); style?.remove(); };
  }, []);
  return state;
}

/** Each contributed tab owns its failure boundary; ordinary document state is outside it. */
export class PluginTabBoundary extends React.Component<{ children: React.ReactNode }, { error?: string }> {
  state: { error?: string } = {};
  static getDerivedStateFromError(error: unknown) { return { error: String(error) }; }
  render() { return this.state.error ? <p role="alert">{i18n.t("Module UI failed.")} {this.state.error}</p> : this.props.children; }
}
