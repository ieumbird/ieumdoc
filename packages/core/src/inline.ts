import { labelError } from "./label.ts";
import { labelIdentifier } from "./myst/label.ts";
import type { MystNode } from "./myst/tree.ts";

/** Reference roles authored as inline content: {eq} for Equations, {numref} for Figures and
 * Tables, and {ref} for sections, through the `(label)=` target before their heading. */
export type ReferenceRole = "eq" | "numref" | "ref";
const REFERENCE_ROLES = new Set<string>(["eq", "numref", "ref"]);

export type InlineContent =
  | { kind: "break" }
  | {
      kind: "text";
      text: string;
    }
  | {
      /** Inline math: its LaTeX source. Display equations are blocks, not inline content. */
      kind: "math";
      value: string;
    }
  | {
      /** Inline code: its literal text. */
      kind: "code";
      value: string;
    }
  | {
      kind: "strong";
      children: InlineContent[];
    }
  | {
      kind: "emphasis";
      children: InlineContent[];
    }
  | {
      /** Strikethrough, written as the MyST `{del}` role. */
      kind: "delete";
      children: InlineContent[];
    }
  | {
      /** Subscript or superscript text, written as the MyST `{sub}` or `{sup}` role. Math belongs in
       * inline math; these never nest in each other and hold no references or footnotes. */
      kind: "subscript" | "superscript";
      children: InlineContent[];
    }
  | {
      /** An ordinary Markdown link. Semantic cross-references are not links. */
      kind: "link";
      url: string;
      title?: string;
      children: InlineContent[];
    }
  | {
      /** A local cross-reference to a labeled Equation ({eq}), Figure or Table ({numref}), or
       * section ({ref}), written without custom text. The label is kept as written; it may name no target. */
      kind: "reference";
      role: ReferenceRole;
      label: string;
    }
  | {
      /** A footnote reference `[^label]`. MyST numbers footnotes in first-reference order; the
       * definition is its own block. The label is kept as written and matched exactly. */
      kind: "footnote";
      label: string;
    };

/** The mark an item applies to its content, for comparing rendered semantics:
 * strong/emphasis nesting is irrelevant, a link's target is part of the mark. */
export function inlineMarkKey(item: InlineContent): string | undefined {
  if (MARK_KINDS.has(item.kind)) return item.kind;
  if (item.kind === "link") return `link ${JSON.stringify([item.url, item.title ?? null])}`;
  return undefined;
}

const LINK_FIELDS = new Set(["type", "url", "title", "children", "position"]);
const REFERENCE_FIELDS = new Set(["type", "kind", "identifier", "label", "position"]);
const FOOTNOTE_FIELDS = new Set(["type", "identifier", "label", "position"]);
// A `class` or `label` role option has no InlineContent form.
const SCRIPT_FIELDS = new Set(["type", "children", "position"]);
const SCRIPT_KINDS = new Set(["subscript", "superscript"]);

export function projectInlineContent(node: MystNode): InlineContent[] | undefined {
  return projectNodes(node.children ?? []);
}

export function inlineContentToNodes(content: InlineContent[]): MystNode[] {
  return content.map(inlineToNode);
}

/** Readable text: inline math appears as its `$source$`, a reference as its role, a footnote as `[^label]`. */
export function inlineContentText(content: InlineContent[]): string {
  return content
    .map((item) => (item.kind === "text" ? item.text : item.kind === "break" ? "\n"
      : item.kind === "math" ? `$${item.value}$` : item.kind === "code" ? `\`${item.value}\``
      : item.kind === "reference" ? `{${item.role}}\`${item.label}\``
      : item.kind === "footnote" ? `[^${item.label}]`
      : inlineContentText(item.children)))
    .join("");
}

function projectNodes(nodes: MystNode[]): InlineContent[] | undefined {
  const content: InlineContent[] = [];
  for (const node of nodes) {
    const item = projectNode(node);
    if (!item) return undefined;
    content.push(item);
  }
  return content;
}

function projectNode(node: MystNode): InlineContent | undefined {
  if (node.type === "break") return { kind: "break" };
  if (node.type === "inlineMath" && typeof node.value === "string" && node.value.length > 0 &&
      Object.keys(node).every((key) => key === "type" || key === "value" || key === "position")) {
    return { kind: "math", value: node.value };
  }
  if (node.type === "text") {
    return { kind: "text", text: typeof node.value === "string" ? node.value : "" };
  }
  if (node.type === "inlineCode" && typeof node.value === "string" && node.value.length > 0 &&
      Object.keys(node).every((key) => key === "type" || key === "value" || key === "position")) {
    return { kind: "code", value: node.value };
  }
  // Only `{eq}`label``, `{numref}`label`` and `{ref}`label``: custom text (`Figure %s <label>`)
  // and other roles stay unsupported.
  if (node.type === "crossReference" && typeof node.kind === "string" && REFERENCE_ROLES.has(node.kind) &&
      typeof node.label === "string" && node.label.length > 0 && node.identifier === labelIdentifier(node.label) &&
      Object.keys(node).every((key) => REFERENCE_FIELDS.has(key))) {
    return { kind: "reference", role: node.kind as ReferenceRole, label: node.label };
  }
  if (node.type === "footnoteReference" && typeof node.label === "string" && !footnoteLabelError(node.label) &&
      node.identifier === labelIdentifier(node.label) && Object.keys(node).every((key) => FOOTNOTE_FIELDS.has(key))) {
    return { kind: "footnote", label: node.label };
  }
  if (node.type === "strong" || node.type === "emphasis" || node.type === "delete") {
    const children = projectNodes(node.children ?? []);
    if (!children) return undefined;
    return { kind: node.type, children };
  }
  if ((node.type === "subscript" || node.type === "superscript") && Object.keys(node).every((key) => SCRIPT_FIELDS.has(key))) {
    const children = projectNodes(node.children ?? []);
    if (!children || scriptContentError(children)) return undefined;
    return { kind: node.type, children };
  }
  // Only plain links with visible text: `[](#x)`, `{download}` (static) and links
  // around images or other nodes stay unsupported.
  if (node.type === "link" && typeof node.url === "string" && node.url.length > 0 &&
      (node.title === undefined || typeof node.title === "string") &&
      Object.keys(node).every((key) => LINK_FIELDS.has(key))) {
    const children = projectNodes(node.children ?? []);
    if (!children || inlineContentText(children).length === 0 || containsLink(children) ||
        containsReference(children)) return undefined;
    return { kind: "link", url: node.url, ...(node.title !== undefined ? { title: node.title } : {}), children };
  }
  return undefined;
}

function containsLink(content: InlineContent[]): boolean {
  return content.some((item) => item.kind === "link" || ("children" in item && containsLink(item.children)));
}

function containsReference(content: InlineContent[]): boolean {
  return content.some((item) => item.kind === "reference" || item.kind === "footnote" ||
    ("children" in item && containsReference(item.children)));
}

function containsScript(content: InlineContent[]): boolean {
  return content.some((item) => SCRIPT_KINDS.has(item.kind) || ("children" in item && containsScript(item.children)));
}

/** Why `children` cannot be subscript or superscript text, or undefined. A footnote already
 * renders raised, and a script inside the other has no plain-text meaning. */
function scriptContentError(children: InlineContent[]): string | undefined {
  if (containsReference(children)) return "subscript and superscript cannot contain references or footnotes";
  if (containsScript(children)) return "subscript and superscript cannot be nested";
  return undefined;
}

/** Why `label` cannot be a footnote label as MyST reads `[^label]`, or undefined. */
function footnoteLabelError(label: string): string | undefined {
  return /^[^\s\]]+$/.test(label) && labelIdentifier(label) ? undefined : "footnote label must be non-empty and contain no whitespace or ]";
}

function inlineToNode(item: InlineContent): MystNode {
  if (item.kind === "break") return { type: "break" };
  if (item.kind === "math") return { type: "inlineMath", value: item.value };
  if (item.kind === "code") return { type: "inlineCode", value: item.value };
  if (item.kind === "reference") {
    return { type: "crossReference", kind: item.role, identifier: labelIdentifier(item.label), label: item.label };
  }
  if (item.kind === "footnote") return { type: "footnoteReference", identifier: labelIdentifier(item.label), label: item.label };
  if (item.kind === "text") {
    return { type: "text", value: item.text };
  }
  if (MARK_KINDS.has(item.kind) && "children" in item) {
    return { type: item.kind, children: item.children.map(inlineToNode) };
  }
  if (item.kind === "link") {
    const node: MystNode = { type: "link", url: item.url, children: item.children.map(inlineToNode) };
    if (item.title !== undefined) node.title = item.title;
    return node;
  }
  throw new Error("unsupported InlineContent");
}

export function assertInlineContent(content: InlineContent[]): void {
  if (!Array.isArray(content)) {
    throw new Error("InlineContent must be an array");
  }
  for (const item of content) {
    if (!item || typeof item !== "object") {
      throw new Error("InlineContent item must be an object");
    }
    if (item.kind === "break") continue;
    if (item.kind === "math") {
      if (typeof item.value !== "string" || item.value.length === 0 || /[\r\n]/.test(item.value)) {
        throw new Error("inline math must be non-empty single-line LaTeX");
      }
      continue;
    }
    if (item.kind === "code") {
      if (typeof item.value !== "string" || item.value.length === 0 || /[\r\n]/.test(item.value)) {
        throw new Error("inline code must be non-empty single-line text");
      }
      continue;
    }
    if (item.kind === "text") {
      if (typeof item.text !== "string") {
        throw new Error("text InlineContent requires a string");
      }
      continue;
    }
    if (item.kind === "strong" || item.kind === "emphasis" || item.kind === "delete") {
      assertInlineContent(item.children);
      continue;
    }
    if (item.kind === "subscript" || item.kind === "superscript") {
      assertInlineContent(item.children);
      const error = scriptContentError(item.children);
      if (error) throw new Error(error);
      continue;
    }
    if (item.kind === "link") {
      if (typeof item.url !== "string" || item.url.length === 0 || /\s/.test(item.url)) {
        throw new Error("link URL must be non-empty and contain no whitespace");
      }
      if (item.title !== undefined && (typeof item.title !== "string" || /[\r\n]/.test(item.title))) {
        throw new Error("link title must be a single-line string");
      }
      assertInlineContent(item.children);
      if (inlineContentText(item.children).length === 0) {
        throw new Error("link text cannot be empty");
      }
      if (containsLink(item.children)) {
        throw new Error("links cannot contain links");
      }
      if (containsReference(item.children)) {
        throw new Error("links cannot contain references or footnotes");
      }
      continue;
    }
    if (item.kind === "reference") {
      if (!REFERENCE_ROLES.has(item.role)) throw new Error("reference role must be eq or numref");
      const error = typeof item.label === "string" ? labelError(item.label) : "Label must be a string.";
      if (error) throw new Error(`reference label: ${error}`);
      if (!labelIdentifier(item.label)) throw new Error("reference label must name a target");
      continue;
    }
    if (item.kind === "footnote") {
      const error = typeof item.label === "string" ? footnoteLabelError(item.label) : "footnote label must be a string";
      if (error) throw new Error(error);
      continue;
    }
    throw new Error("unsupported InlineContent kind");
  }
}

/** Rendered offsets use JavaScript UTF-16 code units; a break, inline math, a reference and a footnote each have length one,
 * inline code counts its characters.
 * Marks contribute only their children. No grapheme segmentation is performed. */
export function inlineContentLength(content: InlineContent[]): number {
  return content.reduce((length, item) => length + (item.kind === "text" ? item.text.length
    : item.kind === "code" ? item.value.length
    : item.kind === "break" || item.kind === "math" || item.kind === "reference" || item.kind === "footnote" ? 1
    : inlineContentLength(item.children)), 0);
}

export function splitInlineContent(content: InlineContent[], offset: number): [InlineContent[], InlineContent[]] {
  const left: InlineContent[] = [];
  const right: InlineContent[] = [];
  let remaining = offset;
  for (const item of content) {
    const length = inlineContentLength([item]);
    if (remaining <= 0) right.push(item);
    else if (remaining >= length) left.push(item);
    else if (item.kind === "text") {
      left.push({ kind: "text", text: item.text.slice(0, remaining) });
      right.push({ kind: "text", text: item.text.slice(remaining) });
    } else if (item.kind === "code") {
      left.push({ kind: "code", value: item.value.slice(0, remaining) });
      right.push({ kind: "code", value: item.value.slice(remaining) });
    } else if ("children" in item) {
      const [a, b] = splitInlineContent(item.children, remaining);
      if (a.length) left.push({ ...item, children: a });
      if (b.length) right.push({ ...item, children: b });
    }
    remaining -= length;
  }
  return [left, right];
}

/** Coalesce adjacent equal marks, and adjacent inline code, so Markdown delimiters cannot collide.
 * Adjacent links stay separate: `[a](x)[b](x)` is two links. */
const MARK_KINDS = new Set(["strong", "emphasis", "delete", "subscript", "superscript"]);

export function concatenateInlineContent(...parts: InlineContent[][]): InlineContent[] {
  const result: InlineContent[] = [];
  for (const item of parts.flat()) {
    const current = "children" in item
      ? { ...item, children: concatenateInlineContent(item.children) } : { ...item };
    const previous = result.at(-1);
    if (previous?.kind === "text" && current.kind === "text") previous.text += current.text;
    else if (previous?.kind === "code" && current.kind === "code") previous.value += current.value;
    else if (previous && current.kind === previous.kind && MARK_KINDS.has(current.kind) && "children" in previous && "children" in current) {
      previous.children = concatenateInlineContent(previous.children, current.children);
    } else result.push(current);
  }
  return result;
}

export function insertInlineBreak(content: InlineContent[], offset: number): InlineContent[] {
  let remaining = offset;
  for (const [index, item] of content.entries()) {
    const length = inlineContentLength([item]);
    if (remaining > 0 && remaining < length && "children" in item) {
      return [...content.slice(0, index), { ...item, children: insertInlineBreak(item.children, remaining) }, ...content.slice(index + 1)];
    }
    remaining -= length;
  }
  const [left, right] = splitInlineContent(content, offset);
  return concatenateInlineContent(left, [{ kind: "break" }], right);
}

/** Compare inline semantics independent of text fragmentation and mark nesting. */
export function sameInlineContent(left: InlineContent[], right: InlineContent[]): boolean {
  const markedText = (content: InlineContent[], marks: string[] = []): [string, string][] => content.flatMap((item) => {
    if (item.kind === "text") return item.text.split("").map((text) => [text, marks.join(",")]);
    if (item.kind === "break") return [["\n", [...marks, "break"].sort().join(",")]];
    if (item.kind === "math") return [[`math ${item.value}`, [...marks, "math"].sort().join(",")]];
    if (item.kind === "code") return item.value.split("").map((text) => [text, [...marks, "code"].sort().join(",")]);
    if (item.kind === "reference") {
      return [[`reference ${item.role} ${item.label}`, [...marks, "reference"].sort().join(",")]];
    }
    if (item.kind === "footnote") return [[`footnote ${item.label}`, [...marks, "footnote"].sort().join(",")]];
    return markedText(item.children, [...new Set([...marks, inlineMarkKey(item)!])].sort());
  });
  return JSON.stringify(markedText(left)) === JSON.stringify(markedText(right));
}
