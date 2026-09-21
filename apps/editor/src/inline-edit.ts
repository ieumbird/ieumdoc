import type { InlineContent } from "@ieumdoc/core";

export function inlineText(content: InlineContent[]): string {
  return content.map((item) => (item.kind === "text" ? item.text : inlineText(item.children))).join("");
}

export function splitInlineContent(
  content: InlineContent[],
  offset: number,
): { before: InlineContent[]; after: InlineContent[] } {
  if (offset <= 0) return { before: [], after: content };
  const before: InlineContent[] = [];
  const after: InlineContent[] = [];
  let remaining = offset;
  let crossed = false;
  for (const item of content) {
    if (crossed) {
      after.push(item);
      continue;
    }
    const length = item.kind === "text" ? item.text.length : inlineText(item.children).length;
    if (remaining >= length) {
      before.push(item);
      remaining -= length;
      continue;
    }
    crossed = true;
    if (item.kind === "text") {
      const left = item.text.slice(0, remaining);
      const right = item.text.slice(remaining);
      if (left.length > 0) before.push({ kind: "text", text: left });
      if (right.length > 0) after.push({ kind: "text", text: right });
    } else {
      const inner = splitInlineContent(item.children, remaining);
      if (inner.before.length > 0) before.push({ kind: item.kind, children: inner.before });
      if (inner.after.length > 0) after.push({ kind: item.kind, children: inner.after });
    }
  }
  return { before, after };
}

export function concatInlineContent(left: InlineContent[], right: InlineContent[]): InlineContent[] {
  if (left.length === 0) return right;
  if (right.length === 0) return left;
  const last = left[left.length - 1];
  const first = right[0];
  if (last?.kind === "text" && first?.kind === "text") {
    return [...left.slice(0, -1), { kind: "text", text: last.text + first.text }, ...right.slice(1)];
  }
  return [...left, ...right];
}
