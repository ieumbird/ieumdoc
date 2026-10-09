import { Extension } from "@tiptap/core";
import { closeHistory } from "@tiptap/pm/history";
import { NodeSelection, Plugin, PluginKey } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { ASSET_FORMATS, isAssetMime, MAX_ASSET_BYTES } from "../shared/asset-policy.ts";
import type { AssetResponse } from "../shared/asset-protocol.ts";
import { insertFigureAfter } from "./block-commands.ts";
import { isInternalClipboard } from "./document-interaction.ts";

type AssetHost = {
  create(file: File, documentPath: string): Promise<AssetResponse>;
  rollback(created: AssetResponse, documentPath: string): Promise<void>;
};
type Options = { documentPath: string; reject(reason: string): void; pending?(active: boolean): void; host?: AssetHost };

const browserHost: AssetHost = {
  async create(file, documentPath) {
    let response: Response, body: AssetResponse & { error?: string };
    try {
      response = await fetch(`${import.meta.env.BASE_URL}api/asset?path=${encodeURIComponent(documentPath)}`, {
        method: "POST", headers: { "Content-Type": file.type }, body: file,
      });
      body = await response.json() as AssetResponse & { error?: string };
    } catch {
      throw new Error("Asset response was interrupted. No Figure was inserted; an unreferenced image may remain in assets/.");
    }
    if (!response.ok) throw new Error(body.error ?? "Image could not be saved.");
    if (typeof body.path !== "string" || typeof body.rollbackToken !== "string") throw new Error("Host returned an invalid asset response. The image may remain on disk; no Figure was inserted.");
    return body;
  },
  async rollback(created, documentPath) {
    const response = await fetch(`${import.meta.env.BASE_URL}api/asset`, {
      method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ documentPath, ...created }),
    });
    if (!response.ok) {
      const body = await response.json() as { error?: string };
      throw new Error(body.error ?? "Host could not remove the asset.");
    }
  },
};

/** Upload state lives only in the engine plugin; mapped positions are never persistent IDs. */
export function imageAssetsPlugin(options: Options): Plugin {
  type Pending = { anchor: number | null; selectionMoved: boolean } | null;
  const key = new PluginKey<Pending>("imageAsset");
  const host = options.host ?? browserHost;
  let uploading = false, destroyed = false;
  const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);

  const upload = async (view: EditorView, file: File, position: number) => {
    uploading = true;
    options.pending?.(true);
    let created: AssetResponse | undefined;
    try {
      const $pos = view.state.doc.resolve(position);
      const anchor = $pos.depth > 0 ? $pos.before(1) : Math.min(position, view.state.doc.content.size - view.state.doc.lastChild!.nodeSize);
      view.dispatch(view.state.tr.setMeta(key, { anchor, selectionMoved: false }));
      created = await host.create(file, options.documentPath);
      const pending = key.getState(view.state);
      if (destroyed || !view.editable || pending?.anchor == null) throw new Error("Image insertion was cancelled because its Editor or target block changed.");
      const index = view.state.doc.resolve(pending.anchor).index(0);
      const tr = insertFigureAfter(view.state, index, undefined, { imageUrl: created.path, imageAlt: "" });
      if (!(tr.selection instanceof NodeSelection) || tr.selection.node.type.name !== "figure") throw new Error("Figure command did not produce an insertion.");
      const sourcePath = tr.selection.node.attrs.sourcePath;
      // Upload completion must not steal a caret that moved while the request ran.
      const keepSelection = pending.selectionMoved || !view.hasFocus();
      if (keepSelection) tr.setSelection(view.state.selection.map(tr.doc, tr.mapping));
      view.dispatch(tr);
      const accepted = view.state.doc.content.content.some(node => node.type.name === "figure" && node.attrs.sourcePath === sourcePath && node.attrs.imageUrl === created!.path);
      if (!accepted) throw new Error("The Figure insertion was rejected; your document is unchanged.");
      view.dispatch(closeHistory(view.state.tr).setMeta("addToHistory", false));
      if (!keepSelection) view.focus();
    } catch (error) {
      let message = `Image could not be inserted: ${errorText(error)}`;
      if (created) {
        try { await host.rollback(created, options.documentPath); }
        catch (rollbackError) { message += ` Rollback failed; asset remains at ${created.path}: ${errorText(rollbackError)}`; }
      }
      options.reject(message);
    } finally {
      if (!destroyed) view.dispatch(view.state.tr.setMeta(key, null));
      uploading = false;
      options.pending?.(false);
    }
  };

  const files = (view: EditorView, event: ClipboardEvent | DragEvent, input: FileList | undefined, position: number) => {
    if (!input?.length) return false;
    event.preventDefault();
    if (!view.editable) { options.reject("This document is read-only. No image was added."); return true; }
    if (uploading) { options.reject("Wait for the current image to finish before adding another."); return true; }
    const file = input[0];
    if (input.length !== 1 || !isAssetMime(file.type)) { options.reject(`Add one ${ASSET_FORMATS} image at a time. No image was added.`); return true; }
    if (file.size === 0 || file.size > MAX_ASSET_BYTES) { options.reject(`Image must be non-empty and at most ${MAX_ASSET_BYTES / 1024 / 1024} MiB. No image was added.`); return true; }
    void upload(view, file, position);
    return true;
  };

  return new Plugin<Pending>({
    key,
    state: {
      init: () => null,
      apply(tr, pending) {
        const meta = tr.getMeta(key) as Pending | undefined;
        if (meta !== undefined) return meta;
        if (!pending) return null;
        const mapped = pending.anchor == null ? null : tr.mapping.mapResult(pending.anchor, 1);
        return { anchor: !mapped || mapped.deleted ? null : mapped.pos, selectionMoved: pending.selectionMoved || tr.selectionSet || tr.docChanged };
      },
    },
    view: () => ({ destroy() { destroyed = true; } }),
    props: {
      handleDOMEvents: {
        paste: (view, event) => {
          const data = event.clipboardData;
          // Preserve IeumDoc's lossless typed clipboard, even if the OS adds an image flavor.
          if (isInternalClipboard(data?.getData("text/html") ?? "")) return false;
          return files(view, event, data?.files, view.state.selection.from);
        },
        drop: (view, event) => {
          if (!event.dataTransfer?.files.length) return false; // Internal block reordering stays with its existing handler.
          const position = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos ?? view.state.selection.from;
          return files(view, event, event.dataTransfer.files, position);
        },
        dragover: (_view, event) => {
          if (!event.dataTransfer?.types.includes("Files")) return false;
          event.preventDefault(); return true;
        },
      },
    },
  });
}

export function imageAssets(options: Options): Extension {
  return Extension.create({ name: "imageAssets", priority: 180, addProseMirrorPlugins: () => [imageAssetsPlugin(options)] });
}
