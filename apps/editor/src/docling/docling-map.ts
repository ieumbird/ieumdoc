// SPIKE (docling-compare-1030): the `*.docling-map.json` sidecar written by the instrumented converter.
export type DoclingBox = { l: number; t: number; r: number; b: number; coord_origin: "BOTTOMLEFT" | "TOPLEFT" };
export type DoclingItem = {
  ref: string; label: string; layer: string; page: number; bbox: DoclingBox; text?: string; parent?: string;
  /** Top-level block index in the converted document (0 is front matter), or null when not converted. */
  block: number | null; kind?: string; reason?: string; item?: number; footnote?: string; continued?: boolean;
};
export type DoclingPage = { size: { width: number; height: number }; image: { uri: string; dpi: number; size: { width: number; height: number } } | null };
export type DoclingMap = { schema: string; source?: { name?: string; version?: string; origin?: string }; document: string; blockCount: number; blockTypes?: string[];
  pages: Record<string, DoclingPage>; items: DoclingItem[] };

export type Category = "heading" | "text" | "list" | "table" | "picture" | "formula" | "footnote";
export const CATEGORY_COLOR: Record<Category, string> = { heading: "#4f5bd5", text: "#0f8f8a", list: "#2f9e6e", table: "#c77d12",
  picture: "#b4529b", formula: "#7c5cd6", footnote: "#d0567a" };
export const CATEGORY_LABEL: Record<Category, string> = { heading: "제목", text: "본문", list: "목록", table: "표·표 캡션",
  picture: "그림·그림 캡션", formula: "수식", footnote: "각주" };

export function categoryOf(item: DoclingItem): Category {
  switch (item.label) {
    case "title": case "section_header": return "heading";
    case "list_item": return "list";
    case "table": return "table";
    case "picture": case "chart": return "picture";
    case "formula": return "formula";
    case "footnote": return item.footnote ? "footnote" : "text";
    default: return "text";
  }
}

/** What a converted item points at; null for items that did not become content. */
export function targetKey(item: DoclingItem): string | null {
  if (item.footnote) return `fn:${item.footnote}`;
  if (item.block == null) return null;
  return item.item != null ? `${item.block}.${item.item}` : String(item.block);
}

/** Anchor pairs ordered on both sides, bracketed by the scroll extremes. */
export function monotonicAnchors(pairs: [number, number][], leftEnd: number, rightEnd: number): [number, number][] {
  const sorted = [...pairs].sort((a, b) => a[0] - b[0]);
  const result: [number, number][] = [[0, 0]];
  for (const pair of sorted) {
    const last = result.at(-1)!;
    if (pair[0] > last[0] + 0.5 && pair[1] >= last[1]) result.push(pair);
  }
  const last = result.at(-1)!;
  if (leftEnd > last[0] && rightEnd >= last[1]) result.push([leftEnd, rightEnd]);
  return result;
}

/** Piecewise-linear lookup from one side's content offset to the other's. */
export function interpolate(points: [number, number][], value: number): number {
  if (!points.length) return value;
  const sorted = [...points].sort((a, b) => a[0] - b[0]);
  if (value <= sorted[0]![0]) return sorted[0]![1] + (value - sorted[0]![0]);
  for (let index = 1; index < sorted.length; index++) {
    const [x0, y0] = sorted[index - 1]!, [x1, y1] = sorted[index]!;
    if (value <= x1) return x1 === x0 ? y1 : y0 + ((value - x0) / (x1 - x0)) * (y1 - y0);
  }
  const [x, y] = sorted.at(-1)!;
  return y + (value - x);
}
