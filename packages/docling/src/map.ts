import { createHash } from "node:crypto";
import { getEditableDocument, parse, type EditableBlock, type ListContent } from "@litzio/core";
import type { ImageRef, Provenance, SourceDocument } from "./source.ts";

export type Target = {
  path: number[]; block: EditableBlock["block"]; role: "block" | "caption" | "image-content" | "list-item" | "endnote" | "group";
  /** Indexes into public ListContent.items, descending via each item's nested list. */
  item?: number[]; label?: string;
};
export type MapItem = {
  self_ref: string; label: string; content_layer: string; parent: string | null;
  provenance: Provenance[]; status: "converted" | "decoration" | "unsupported";
  targets: Target[]; reason?: string; notes: string[];
};
export type DoclingMap = {
  format: "litzio-docling-map"; version: 1;
  source: { schema_name: string; version: string; name: string; sha256: string };
  document: { file: "document.md"; sha256: string };
  pages: Record<string, { page_no: number; size: { width: number; height: number }; image?: ImageRef | null }>;
  items: MapItem[];
};
export const sha256 = (text: string | Uint8Array): string => createHash("sha256").update(text).digest("hex");

export function createMap(source: SourceDocument, input: string, markdown: string, items: MapItem[]): DoclingMap {
  return { format: "litzio-docling-map", version: 1,
    source: { schema_name: source.schema_name, version: source.version, name: source.name, sha256: sha256(input) },
    document: { file: "document.md", sha256: sha256(markdown) }, pages: structuredClone(source.pages ?? {}), items };
}

/** Validate correspondence against the exact reopened snapshot, including list items and endnotes. */
export function readDoclingMap(json: string, markdown: string): DoclingMap {
  return inspectDoclingMap(json, markdown, false).map;
}

/** A stale snapshot can still show source regions, but its targets must never be followed. */
export function inspectDoclingMap(json: string, markdown: string, allowStale = true): { map: DoclingMap; stale: boolean } {
  const map = JSON.parse(json) as DoclingMap;
  if (!map || map.format !== "litzio-docling-map" || map.version !== 1) throw new Error("Unsupported Docling map format/version");
  const stale = map.document?.sha256 !== sha256(markdown);
  if (stale && !allowStale) throw new Error("Stale Docling map: document SHA-256 mismatch");
  if (!Array.isArray(map.items) || !map.source || map.source.schema_name !== "DoclingDocument" || map.source.version !== "1.10.0" ||
      typeof map.source.name !== "string" || !/^[a-f0-9]{64}$/u.test(map.source.sha256) ||
      !map.pages || typeof map.pages !== "object" || Array.isArray(map.pages) || map.document.file !== "document.md") throw new Error("Invalid Docling map");
  if (!/^[a-f0-9]{64}$/u.test(map.document.sha256)) throw new Error("Invalid document hash");
  for (const [key, page] of Object.entries(map.pages)) {
    if (!page || String(page.page_no) !== key || !Number.isInteger(page.page_no) || page.page_no < 1 ||
        !page.size || !Number.isFinite(page.size.width) || !Number.isFinite(page.size.height) ||
        page.size.width <= 0 || page.size.height <= 0 ||
        (page.image != null && (typeof page.image !== "object" || typeof page.image.uri !== "string"))) throw new Error("Invalid mapping page");
  }
  const blocks = getEditableDocument(parse(markdown)).blocks;
  const byPath = new Map(blocks.map(block => [JSON.stringify(block.path), block]));
  const seen = new Set<string>();
  for (const item of map.items) {
    if (!item || typeof item.self_ref !== "string" || typeof item.label !== "string" || typeof item.content_layer !== "string" ||
        (item.parent !== null && typeof item.parent !== "string") || seen.has(item.self_ref) || !Array.isArray(item.notes) ||
        !item.notes.every(note => typeof note === "string") || !Array.isArray(item.provenance) || !Array.isArray(item.targets)) throw new Error("Invalid Docling map item");
    seen.add(item.self_ref);
    if (!["converted", "decoration", "unsupported"].includes(item.status) ||
        (item.status === "converted" ? item.targets.length === 0 : item.targets.length !== 0) ||
        (item.status !== "converted" && (typeof item.reason !== "string" || !item.reason))) throw new Error(`Invalid mapping status: ${item.self_ref}`);
    for (const p of item.provenance) {
      if (!p || !Number.isInteger(p.page_no) || !map.pages[String(p.page_no)] || !p.bbox ||
          ![p.bbox.l, p.bbox.t, p.bbox.r, p.bbox.b].every(Number.isFinite) ||
          !["TOPLEFT", "BOTTOMLEFT"].includes(p.bbox.coord_origin ?? "") ||
          !Array.isArray(p.charspan) || p.charspan.length !== 2 || !p.charspan.every(Number.isInteger)) throw new Error(`Invalid mapping provenance: ${item.self_ref}`);
    }
    for (const target of item.targets) {
      if (!Array.isArray(target.path) || target.path.length !== 1 || !Number.isInteger(target.path[0]) ||
          !["block", "caption", "image-content", "list-item", "endnote", "group"].includes(target.role)) throw new Error(`Invalid target: ${item.self_ref}`);
      if (stale) continue;
      const block = byPath.get(JSON.stringify(target.path));
      if (!block || block.block !== target.block) throw new Error(`Missing target block: ${item.self_ref}`);
      if (target.role === "caption" && !["figure", "table"].includes(block.block)) throw new Error("Invalid caption target");
      if (target.role === "image-content" && block.block !== "figure") throw new Error("Invalid image target");
      if (target.role === "endnote" && (block.block !== "footnote" || block.label !== target.label)) throw new Error("Missing endnote target");
      if (target.role === "list-item" || target.item !== undefined) {
        if (block.block !== "list" || !Array.isArray(target.item) || !target.item.length) throw new Error("Missing list item target");
        let list: ListContent | undefined = block;
        for (const [depth, index] of target.item.entries()) {
          if (!Number.isInteger(index) || index < 0 || !list?.items[index]) throw new Error("Missing list item target");
          if (depth < target.item.length - 1) list = list.items[index].list;
        }
      }
    }
  }
  return { map, stale };
}
