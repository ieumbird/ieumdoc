import type { EditableDocument } from "@litzio/core";
import type { DoclingMap, MapItem, Target } from "./map.ts";

export type ComparisonSnapshot = { path: string; document: EditableDocument; map: DoclingMap; stale: boolean };
export type { DocumentPosition, ReadingSurfaceProps } from "@litzio/plugin-api/ui";
export type BlockPosition = import("@litzio/plugin-api/ui").DocumentPosition["blocks"][number];

/** Prefer the actual converted block over groups and picture-pixel descendants. */
export function itemsForTarget(items: MapItem[], key: string): MapItem[] {
  const matches = items.filter(item => item.targets.some(target => targetKey(target) === key || (!key.includes(":") && targetKey(target).startsWith(`${key}:`))));
  const direct = matches.filter(item => item.targets.some(target => target.role !== "group" && target.role !== "image-content" && target.role !== "caption" &&
    (targetKey(target) === key || (!key.includes(":") && targetKey(target).startsWith(`${key}:`)))));
  return direct.length ? direct : matches;
}
export type Region = { left: number; top: number; width: number; height: number };
export const targetKey = (target: Pick<Target, "path" | "item">) => JSON.stringify(target.path) + (target.item ? `:${target.item.join(".")}` : "");

/** Fractions of the source page, including Docling's two coordinate origins. */
export function pageRegion(bbox: MapItem["provenance"][number]["bbox"], size: { width: number; height: number }): Region {
  const x1 = Math.min(bbox.l, bbox.r), x2 = Math.max(bbox.l, bbox.r);
  const y1 = Math.min(bbox.t, bbox.b), y2 = Math.max(bbox.t, bbox.b);
  return { left: x1 / size.width, top: (bbox.coord_origin === "BOTTOMLEFT" ? size.height - y2 : y1) / size.height,
    width: (x2 - x1) / size.width, height: (y2 - y1) / size.height };
}

export const categories = ["heading", "text", "list", "table", "formula", "picture", "footnote", "decoration", "unsupported"] as const;
export type Category = typeof categories[number];
export function categoryOf(item: MapItem): Category {
  if (item.status !== "converted") return item.status;
  if (item.label === "title" || item.label === "section_header") return "heading";
  if (item.label === "list_item") return "list";
  return ["table", "formula", "picture", "footnote"].includes(item.label) ? item.label as Category : "text";
}

/** Endnotes and groups may run backwards in reading order. They are links, not scroll anchors. */
export function scrollAnchors(points: [number, number][]): [number, number][] {
  const result: [number, number][] = [];
  for (const point of points.sort((a, b) => a[0] - b[0] || a[1] - b[1])) {
    const last = result.at(-1);
    if (!last || point[0] > last[0] && point[1] > last[1]) result.push(point);
  }
  return result;
}
export function scrollPosition(points: [number, number][], value: number, reverse = false): number {
  if (!points.length) return value;
  const from = reverse ? 1 : 0, to = reverse ? 0 : 1;
  let index = points.findIndex(point => point[from] >= value);
  if (index === 0) return Math.max(0, points[0]![to] + value - points[0]![from]);
  if (index < 0) { const last = points.at(-1)!; return last[to] + value - last[from]; }
  const a = points[index - 1]!, b = points[index]!;
  return a[to] + (value - a[from]) / (b[from] - a[from]) * (b[to] - a[to]);
}
