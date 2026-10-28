// SPIKE: edit a Figure's `.drawio.svg` image in the Host's local Draw.io webapp (embed=1&proto=json).
import { useEffect, useRef, useState } from "react";
import type { DrawioFile, DrawioInfo, DrawioWriteResponse } from "../shared/drawio-protocol.ts";
import { i18n } from "./i18n.ts";
import { Button } from "@/components/ui/button.tsx";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import { diagramSaved, setDiagramDirty, type DiagramTab } from "./drawio-tabs.ts";

export { drawioAction, isDrawioImage } from "../shared/drawio-protocol.ts";

const api = () => `${import.meta.env.BASE_URL}api/drawio`;
let info: Promise<DrawioInfo> | undefined;
export function drawioInfo(): Promise<DrawioInfo> {
  info ??= fetch(api()).then(response => response.ok ? response.json() as Promise<DrawioInfo> : { available: false, libraries: [] })
    .catch(() => ({ available: false, libraries: [] }));
  return info;
}

export { pendingDrawio } from "./drawio-pending.ts";

async function failure(response: Response): Promise<Error> {
  const body = await response.json().catch(() => ({})) as { error?: string };
  return new Error(body.error ?? response.statusText);
}

async function readDiagram(documentPath: string, path: string): Promise<DrawioFile> {
  const response = await fetch(`${api()}?documentPath=${encodeURIComponent(documentPath)}&path=${encodeURIComponent(path)}`);
  if (!response.ok) throw await failure(response);
  return response.json() as Promise<DrawioFile>;
}

async function writeDiagram(body: { documentPath: string; svg: string; path?: string; revision?: string }): Promise<DrawioWriteResponse> {
  const response = await fetch(api(), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!response.ok) throw await failure(response);
  return response.json() as Promise<DrawioWriteResponse>;
}

/** The diagram XML Draw.io keeps in an editable SVG's root `content` attribute. */
export function diagramXml(svg: string): string {
  const root = new DOMParser().parseFromString(svg, "image/svg+xml").documentElement;
  return root.getAttribute("content") ?? "";
}

function decodeSvg(data: string): string {
  const comma = data.indexOf(",");
  const head = data.slice(0, comma);
  const body = data.slice(comma + 1);
  if (!head.includes(";base64")) return decodeURIComponent(body);
  return new TextDecoder().decode(Uint8Array.from(atob(body), c => c.charCodeAt(0)));
}

function frameUrl(): string {
  const params = new URLSearchParams({ embed: "1", proto: "json", configure: "1", libraries: "1", lang: i18n.language.startsWith("ko") ? "ko" : "en",
    // stealth: no diagrams.net/cloud features. (offline=1 would also hide the embed Save/Exit buttons.)
    saveAndExit: "1", spin: "1", stealth: "1", pwa: "0" });
  return `${import.meta.env.BASE_URL}drawio/index.html?${params}`;
}

type Props = {
  tab: DiagramTab;
  active: boolean;
  /** Draw.io's Save & Exit or Exit (which confirms lost changes itself). */
  onExit: () => void;
};

/** A diagram tab's panel: Draw.io fills the document area and stays mounted while another tab is shown. */
export function DrawioTabPanel({ tab, active, onExit }: Props) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [error, setError] = useState("");
  const state = useRef<{ path?: string; revision?: string; exit?: boolean; file?: Promise<DrawioFile | undefined> }>({ path: tab.path });
  const exit = useRef(onExit);
  exit.current = onExit;

  useEffect(() => {
    const current = state.current;
    const { documentPath } = tab;
    const path = current.path;
    current.file = path ? readDiagram(documentPath, path) : Promise.resolve(undefined);
    current.file.then(file => { current.revision = file?.revision; }, cause => setError(String(cause?.message ?? cause)));
    const post = (message: unknown) => frame.current?.contentWindow?.postMessage(JSON.stringify(message), location.origin);
    const receive = async (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || event.origin !== location.origin || typeof event.data !== "string") return;
      let message: { event?: string; xml?: string; data?: string; exit?: boolean };
      try { message = JSON.parse(event.data); } catch { return; }
      if (message.event === "configure") {
        const { libraries } = await drawioInfo();
        post({ action: "configure", config: {
          defaultLibraries: "general;basic;arrows2;electrical;ieumdoc-custom",
          libraries: [{ title: { main: "IeumDoc" }, entries: [{ id: "ieumdoc-custom", title: { main: i18n.t("Custom libraries") },
            desc: { main: i18n.t("Shape libraries served by this IeumDoc Host") },
            libs: libraries.map(library => ({ title: { main: library.title }, url: new URL(library.url, location.origin).href })) }] }],
        } });
      } else if (message.event === "init") {
        const file = await current.file?.catch(() => undefined);
        // autosave: Draw.io reports each change, which marks the tab unsaved; nothing is written until Save.
        post({ action: "load", xml: file ? diagramXml(file.svg) : "", autosave: 1, title: path?.split("/").pop() ?? i18n.t("New diagram") });
      } else if (message.event === "autosave") {
        setDiagramDirty(tab.id, true);
      } else if (message.event === "save") {
        current.exit = message.exit;
        post({ action: "export", format: "xmlsvg", xml: message.xml, spinKey: "saving" });
      } else if (message.event === "export" && message.data) {
        try {
          const svg = decodeSvg(message.data);
          const created = !current.path;
          const saved = await writeDiagram({ documentPath, svg, path: current.path, revision: current.path ? current.revision : undefined });
          current.path = saved.path;
          current.revision = saved.revision;
          const { placed } = diagramSaved(tab.id, saved.path);
          setError(created && !placed ? i18n.t("The diagram was saved as {{path}}, but its Figure is no longer open.", { path: saved.path }) : "");
          if (current.exit && (placed || !created)) exit.current();
          else post({ action: "status", message: i18n.t("Saved"), modified: false });
        } catch (cause) {
          post({ action: "spinner", show: false });
          setError(i18n.t("Diagram could not be saved: {{reason}}", { reason: cause instanceof Error ? cause.message : String(cause) }));
        }
      } else if (message.event === "exit") exit.current();
    };
    addEventListener("message", receive);
    return () => removeEventListener("message", receive);
  }, [tab.id]);

  return (
    <div role="tabpanel" id={`panel-${tab.id}`} aria-labelledby={`tab-${tab.id}`} hidden={!active} inert={!active}
      className="drawio-tab" data-testid="drawio-editor" data-diagram-tab={tab.id} data-active={active ? "true" : "false"}>
      {error ? <div className="drawio-error" role="alert">{error}</div> : null}
      <iframe ref={frame} className="drawio-frame" title={i18n.t("Draw.io diagram")} src={frameUrl()} />
    </div>
  );
}

/** Closing a diagram tab with changes Draw.io has not saved. */
export function DiagramCloseDialog({ name, onDiscard, onCancel }: { name: string | null; onDiscard(): void; onCancel(): void }) {
  return (
    <Dialog open={name !== null} onOpenChange={next => { if (!next) onCancel(); }}>
      <DialogContent showCloseButton={false} data-testid="drawio-close-dialog">
        <DialogHeader>
          <DialogTitle>{i18n.t("Close without saving?")}</DialogTitle>
          <DialogDescription>{i18n.t("{{name}} has changes that are not saved. Closing the tab discards them.", { name: name ?? "" })}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="secondary" size="sm" onClick={onCancel} autoFocus>{i18n.t("Cancel")}</Button>
          <Button variant="destructive" size="sm" onClick={onDiscard}>{i18n.t("Don't save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
