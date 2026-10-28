// SPIKE: edit a Figure's `.drawio.svg` image in the Host's local Draw.io webapp (embed=1&proto=json).
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { DrawioFile, DrawioInfo, DrawioWriteResponse } from "../shared/drawio-protocol.ts";
import { i18n } from "./i18n.ts";

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
  documentPath: string;
  /** The Figure's current `.drawio.svg`, or undefined to create one in assets/. */
  path?: string;
  onSaved: (path: string) => void;
  onClose: () => void;
};

/** A full-window Draw.io editor. Save writes the file; Save & Exit / Exit close it. */
export function DrawioEditor({ documentPath, path, onSaved, onClose }: Props) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [error, setError] = useState("");
  const state = useRef<{ path?: string; revision?: string; exit?: boolean; file?: Promise<DrawioFile | undefined> }>({ path });

  useEffect(() => {
    const current = state.current;
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
        post({ action: "load", xml: file ? diagramXml(file.svg) : "", autosave: 0, title: path?.split("/").pop() ?? i18n.t("New diagram") });
      } else if (message.event === "save") {
        current.exit = message.exit;
        post({ action: "export", format: "xmlsvg", xml: message.xml, spinKey: "saving" });
      } else if (message.event === "export" && message.data) {
        try {
          const svg = decodeSvg(message.data);
          const saved = await writeDiagram({ documentPath, svg, path: current.path, revision: current.path ? current.revision : undefined });
          current.path = saved.path;
          current.revision = saved.revision;
          setError("");
          onSaved(saved.path);
          if (current.exit) onClose();
          else post({ action: "status", message: i18n.t("Saved"), modified: false });
        } catch (cause) {
          post({ action: "spinner", show: false });
          setError(i18n.t("Diagram could not be saved: {{reason}}", { reason: cause instanceof Error ? cause.message : String(cause) }));
        }
      } else if (message.event === "exit") onClose();
    };
    addEventListener("message", receive);
    return () => removeEventListener("message", receive);
  }, [documentPath, path]);

  return createPortal(
    <div className="drawio-overlay" data-testid="drawio-editor" role="dialog" aria-label={i18n.t("Draw.io diagram")}>
      {error ? <div className="drawio-error" role="alert">{error}</div> : null}
      <iframe ref={frame} className="drawio-frame" title={i18n.t("Draw.io diagram")} src={frameUrl()} />
    </div>,
    document.body,
  );
}
