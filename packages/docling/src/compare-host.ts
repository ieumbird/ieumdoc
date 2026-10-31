import { getEditableDocument, parse } from "@litzio/core";
import { inspectDoclingMap } from "./map.ts";
import type { ComparisonSnapshot } from "./compare.ts";

/** The Host supplies boundary-checked bytes. No filesystem authority is granted to the UI. */
export function readComparison(path: string, markdown: string, correspondence: string): ComparisonSnapshot {
  const { map, stale } = inspectDoclingMap(correspondence, markdown);
  return { path, document: getEditableDocument(parse(markdown)), map, stale };
}
