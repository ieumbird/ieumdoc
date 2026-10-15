import { createTokenizer } from "myst-parser";
import type { MystDocument, MystNode } from "./tree.ts";

// Source-only evidence, outside the semantic tree and canonical-write fingerprint.
// Operation-created text is literal text; only a parsed source can express unescaped syntax.
const sources = new WeakMap<MystDocument, { text: string; options: object; defined: Set<string> }>();

/** Parsed source evidence is shared by all literal-syntax diagnostics. */
export function rememberLiteralSource(document: MystDocument, text: string, options: object, defined: Set<string>): void {
  if (/[\[`]/.test(text)) sources.set(document, { text, options, defined });
}

export type LiteralSyntax =
  | { footnote: true; label: string }
  | { syntax: "reference-link" | "reference-image"; label: string; source: string }
  | { syntax: "inline-code"; source: string; label?: never };

/** Source syntax silently parsed as literal text. MyST's inline positions are container-level,
 * so the tokenizer, not a search of decoded AST text, distinguishes escapes and syntax.
 * This diagnostic-only tokenizer runs the existing rules first: escape, code, math, links
 * and valid footnotes consume their input before the fallback below can see it. */
export function literalSyntaxDiagnostics(document: MystDocument): (LiteralSyntax & { path: number[]; line: number })[] {
  const source = sources.get(document);
  if (!source) return [];
  const tokenizer = createTokenizer(source.options);
  // Capture the installed backtick rule through the public ruler API (without
  // depending on its function name or copying its delimiter/cache algorithm).
  const rules = tokenizer.inline.ruler.getRules("");
  tokenizer.inline.ruler.disable("backticks");
  const otherRules = new Set(tokenizer.inline.ruler.getRules(""));
  const backticks = rules.find(rule => !otherRules.has(rule))!;
  tokenizer.inline.ruler.enable("backticks");
  // MyST leaves bare URLs as text (linkify is off). Reuse markdown-it's URL
  // recognizer solely to suppress diagnostics there; do not change parsing options.
  const urls = new WeakMap<object, { index: number; lastIndex: number }[]>();
  const inUrl = (state: Parameters<typeof backticks>[0], position = state.pos): boolean => {
    let ranges = urls.get(state);
    if (!ranges) urls.set(state, ranges = tokenizer.linkify.match(state.src) ?? []);
    return ranges.some(range => range.index <= position && position < range.lastIndex);
  };
  tokenizer.inline.ruler.at("backticks", (state, silent) => {
    const start = state.pos;
    const pending = state.pending;
    const matched = backticks(state, silent);
    // An unmatched run is appended to pending text; a real code span emits a token.
    if (!silent && matched && state.pending === pending + state.src.slice(start, state.pos) &&
        state.pos < state.posMax && !/\s/.test(state.src[state.pos]) && !inUrl(state, start)) {
      state.push("literal_syntax", "", 0).meta = {
        syntax: "inline-code", source: state.src.slice(start, state.pos),
      } satisfies LiteralSyntax;
    }
    return matched;
  });
  tokenizer.inline.ruler.push("literal_syntax", (state, silent) => {
    if (state.src[state.pos] !== "[" && state.src[state.pos] !== "!") return false;
    if (inUrl(state)) return false;
    // Match markdown-it-footnote's label grammar: nonempty, no space, LF or closing ].
    const match = /^\[\^([^\] \n]+)\]/.exec(state.src.slice(state.pos, state.posMax));
    if (match && !source.defined.has(match[1])) {
      if (!silent) state.push("literal_syntax", "", 0).meta = { footnote: true, label: match[1] } satisfies LiteralSyntax;
      state.pos += match[0].length;
      return true;
    }
    // Label helpers call skipToken in silent mode. Diagnostics must not make failed
    // references look like real links during that lookahead, or recurse into themselves.
    // Inside a valid link, nested reference shapes are intentional display text.
    // Keep code and existing footnote diagnostics independent of this exclusion.
    // markdown-it 13 tracks linkLevel at runtime; the installed typings omit it.
    if (silent || (state as typeof state & { linkLevel: number }).linkLevel > 0) return false;
    const start = state.pos;
    const image = state.src[start] === "!";
    const opening = start + (image ? 1 : 0);
    if (state.src[opening] !== "[") return false;
    const textEnd = state.md.helpers.parseLinkLabel(state, opening, !image);
    if (textEnd < 0 || textEnd + 1 >= state.posMax || state.src[textEnd + 1] !== "[") return false;
    const labelEnd = state.md.helpers.parseLinkLabel(state, textEnd + 1);
    if (labelEnd < 0) return false;
    const label = state.src.slice(textEnd + 2, labelEnd) || state.src.slice(opening + 1, textEnd);
    if (!label || state.env.references?.[state.md.utils.normalizeReference(label)]) return false;
    state.push("literal_syntax", "", 0).meta = {
      syntax: image ? "reference-image" : "reference-link", label, source: state.src.slice(start, labelEnd + 1),
    } satisfies LiteralSyntax;
    state.pos = labelEnd + 1;
    return true;
  });
  type Token = ReturnType<typeof tokenizer.parse>[number];
  const found: (LiteralSyntax & { line: number })[] = [];
  const visit = (tokens: Token[], initialLine = 1): void => {
    let line = initialLine;
    const skipped: boolean[] = [];
    for (const token of tokens) {
      if (token.map) line = token.map[0] + 1;
      if (token.nesting === 1) {
        // Role bodies are tokenized even for non-text roles such as {math} and {eq}.
        skipped.push(token.type === "footnote_open" || token.type === "footnote_reference_open" ||
          token.type === "parsed_role_open" && !["del", "sub", "sup"].includes(token.info));
      }
      if (!skipped.includes(true)) {
        if (token.type === "literal_syntax") found.push({ ...token.meta as LiteralSyntax, line });
        // Image children are alt text, not body text.
        if (token.children && token.type !== "image") visit(token.children, line);
      }
      if (token.nesting === -1) skipped.pop();
    }
  };
  visit(tokenizer.parse(source.text, {}));
  if (found.length === 0) return [];
  // Only actual body text counts, including text in lifted directive captions. A
  // directive's tokenized body may instead have become non-text math or code.
  const textRanges = (node: MystNode, range = node.position): NonNullable<MystNode["position"]>[] => {
    if (["footnoteDefinition", "code", "inlineCode", "math", "inlineMath", "image", "crossReference"].includes(node.type)) return [];
    if (node.type === "text") return range ? [range] : [];
    return (node.children ?? []).flatMap(child => textRanges(child, node.position ?? range));
  };
  const lineBlocks = new Map<number, number>();
  document.children.forEach((node, index) => {
    for (const range of textRanges(node)) {
      for (let line = range.start.line; line <= range.end.line; line++) {
        // Keep the first containing block, as the original range scan did.
        if (!lineBlocks.has(line)) lineBlocks.set(line, index);
      }
    }
  });
  return found.flatMap(diagnostic => {
    const { line } = diagnostic;
    const index = lineBlocks.get(line);
    return index === undefined ? [] : [{ ...diagnostic, path: [index] }];
  });
}
