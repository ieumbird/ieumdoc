import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { createContext } from "react";
import type { MediaReplacement } from "../shared/file-operations.ts";
import type { TiptapJSON } from "./tiptap-document.ts";

export type ImageRenamer = (documentPath: string, imageUrl: string, name: string) => Promise<string>;
export const ImageRenameContext = createContext<ImageRenamer | undefined>(undefined);
type RenameState = { seen: ReadonlyMap<string, ReadonlySet<string>>; aliases: ReadonlyMap<string, ReadonlyMap<string, string>> };
const imageKey = (attrs: Record<string, unknown>) => JSON.stringify([attrs.sourcePath, attrs.imageIdentity ?? ""]);
export const imageRenameKey = new PluginKey<RenameState>("imageRename");

/** Retarget history by image attachment, so a new image may reuse an old filename. */
export function imageRenamesPlugin(): Plugin<RenameState> {
  return new Plugin<RenameState>({
    key: imageRenameKey,
    state: {
      init: (_, state) => {
        const seen = new Map<string, Set<string>>();
        state.doc.descendants(node => { if (node.type.name === "figure") seen.set(imageKey(node.attrs), new Set([node.attrs.imageUrl])); });
        return { seen, aliases: new Map() };
      },
      apply(tr, previous) {
        if (!tr.docChanged && !tr.getMeta(imageRenameKey)) return previous;
        const seen = new Map([...previous.seen].map(([key, urls]) => [key, new Set(urls)]));
        const aliases = new Map([...previous.aliases].map(([key, urls]) => [key, new Map(urls)]));
        tr.doc.descendants(node => {
          if (node.type.name !== "figure") return;
          const key = imageKey(node.attrs);
          const urls = seen.get(key) ?? new Set<string>();
          urls.add(node.attrs.imageUrl); seen.set(key, urls);
        });
        for (const { from, to } of (tr.getMeta(imageRenameKey) ?? []) as MediaReplacement[]) {
          for (const [key, urls] of seen) {
            if (!urls.has(from)) continue;
            const next = aliases.get(key) ?? new Map<string, string>();
            for (const [old, target] of next) if (target === from) next.set(old, to);
            next.set(from, to); urls.add(to); aliases.set(key, next);
          }
        }
        return { seen, aliases };
      },
    },
    appendTransaction(_transactions, _before, state) {
      const aliases = imageRenameKey.getState(state)!.aliases;
      const tr = state.tr;
      state.doc.descendants((node, pos) => {
        const to = node.type.name === "figure" ? aliases.get(imageKey(node.attrs))?.get(node.attrs.imageUrl) : undefined;
        if (to && to !== node.attrs.imageUrl) tr.setNodeAttribute(pos, "imageUrl", to);
      });
      return tr.docChanged ? tr.setMeta("addToHistory", false) : null;
    },
  });
}
export const ImageRenames = Extension.create({ name: "imageRenames", addProseMirrorPlugins: () => [imageRenamesPlugin()] });

/** Change the acknowledged paths without acknowledging other local edits. */
export function renameSnapshot(snapshot: TiptapJSON, replacements: MediaReplacement[]): TiptapJSON {
  const result = structuredClone(snapshot);
  const visit = (node: TiptapJSON) => {
    const to = node.type === "figure" ? replacements.find(item => item.from === node.attrs?.imageUrl)?.to : undefined;
    if (to) node.attrs = { ...node.attrs, imageUrl: to };
    node.content?.forEach(visit);
  };
  visit(result);
  return result;
}

/** Presentation hint only; the Host validates real paths and regular images. */
export function imageFileStem(url: string): string | undefined {
  if (!url || URL.canParse(url) || /^[\\/]/.test(url) || url.includes("\\") || url.split("/").includes("..")) return;
  const leaf = url.split("/").pop()!;
  return /\.(?:png|jpe?g|gif|webp|svg)$/i.test(leaf) ? leaf.replace(/\.[^.]+$/, "") : undefined;
}
