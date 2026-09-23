import { createHtmlId } from "myst-common";
import type { DocumentNode } from "../document.ts";

/**
 * Serializer verification only: the semantics a document must keep through
 * canonical Markdown. This is not an IeumDoc AST; it is compared, never exposed.
 *
 * Every field is semantic unless listed here. Only source locations are ignored.
 */
const SOURCE_FIELDS = new Set(["position"]);

const MARKS = new Set(["strong", "emphasis"]);
// Fingerprint-only field; the parenthesized name cannot collide with a MyST field.
const MARKS_FIELD = "(marks)";

type Fingerprint = { type: string; fields: Record<string, unknown>; children: Fingerprint[] };

export function semanticFingerprint(node: DocumentNode): Fingerprint {
  const fields: Record<string, unknown> = {};
  for (const key of Object.keys(node).sort()) {
    // An undefined field and an absent field mean the same thing.
    if (key === "type" || key === "children" || SOURCE_FIELDS.has(key) || node[key] === undefined) continue;
    // `$$ ... $$ (label)` math records the anchor derived from its identifier; the
    // `{math}` directive it is written as does not. Only the derived value is implied.
    if (key === "html_id" && typeof node.identifier === "string" && node.html_id === createHtmlId(node.identifier)) continue;
    fields[key] = canonicalValue(node[key]);
  }
  // Absent children and an empty children array mean the same thing.
  return { type: node.type, fields, children: normalizeChildren(node, (node.children ?? []).map(semanticFingerprint)) };
}

/**
 * Explicit canonicalizations observed in myst-parser/myst-to-md round-trips.
 * Anything not listed here must match exactly.
 */
function normalizeChildren(node: DocumentNode, children: Fingerprint[]): Fingerprint[] {
  // Marks are flattened by the nearest non-mark parent below.
  if (MARKS.has(node.type)) return children;
  // Table directives (`table`, `csv-table`) are written as `list-table`, whose cells
  // reparse with their inline content wrapped in a single paragraph.
  if (node.type === "tableCell" && children.length === 1 && children[0].type === "paragraph" &&
      Object.keys(children[0].fields).length === 0) {
    return children[0].children;
  }
  return mergeText(flattenMarks(children));
}

/** Strong/emphasis nesting order is not semantic (`***AB***` may reparse either way):
 * each inline leaf records the set of marks covering it instead. */
function flattenMarks(children: Fingerprint[], marks: string[] = []): Fingerprint[] {
  return children.flatMap((child) => {
    if (MARKS.has(child.type) && Object.keys(child.fields).length === 0) {
      return flattenMarks(child.children, [...new Set([...marks, child.type])].sort());
    }
    return marks.length > 0 ? [{ ...child, fields: { ...child.fields, [MARKS_FIELD]: marks } }] : [child];
  });
}

/** Adjacent text with the same marks renders the same however it is fragmented. */
function mergeText(children: Fingerprint[]): Fingerprint[] {
  const result: Fingerprint[] = [];
  for (const child of children) {
    const previous = result.at(-1);
    if (previous && isPlainText(previous) && isPlainText(child) &&
        JSON.stringify(previous.fields[MARKS_FIELD]) === JSON.stringify(child.fields[MARKS_FIELD])) {
      result[result.length - 1] = {
        ...previous, fields: { ...previous.fields, value: `${previous.fields.value}${child.fields.value}` },
      };
    } else result.push(child);
  }
  return result;
}

function isPlainText(node: Fingerprint): boolean {
  return node.type === "text" && typeof node.fields.value === "string" &&
    Object.keys(node.fields).every((key) => key === "value" || key === MARKS_FIELD);
}

/** Return where the first semantic difference is, or undefined when equal. */
export function semanticDifference(before: Fingerprint, after: Fingerprint, path = before.type): string | undefined {
  if (before.type !== after.type) return `${path}: ${before.type} became ${after.type}`;
  for (const key of new Set([...Object.keys(before.fields), ...Object.keys(after.fields)])) {
    const was = JSON.stringify(before.fields[key]);
    const is = JSON.stringify(after.fields[key]);
    if (was !== is) return `${path}: ${key} ${was ?? "(absent)"} became ${is ?? "(absent)"}`;
  }
  for (let index = 0; index < Math.max(before.children.length, after.children.length); index++) {
    const was = before.children[index];
    const is = after.children[index];
    if (!was) return `${path}: unexpected ${is.type} added`;
    if (!is) return `${path}: ${was.type} was dropped`;
    const difference = semanticDifference(was, is, `${path} > ${was.type}`);
    if (difference) return difference;
  }
  return undefined;
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!value || typeof value !== "object") return value;
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    const child = (value as Record<string, unknown>)[key];
    if (child !== undefined) result[key] = canonicalValue(child);
  }
  return result;
}
