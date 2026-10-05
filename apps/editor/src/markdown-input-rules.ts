import { Extension, InputRule, markInputRule, type InputRuleFinder } from "@tiptap/core";
import { closeHistory } from "@tiptap/pm/history";
import type { Fragment, MarkType, NodeType } from "@tiptap/pm/model";
import { TextSelection, type Transaction } from "@tiptap/pm/state";
import { freshBlockPath } from "./tiptap-document.ts";

// Markdown input shortcuts are Editor-only interaction: each one produces the same engine
// document as the equivalent insert or conversion command, and Save maps it to the same Core
// operations. Only blocks, marks and inline math the Editor can author have a shortcut.

/** The only extension whose input rules the editor enables. */
export const MARKDOWN_INPUT_RULES = "markdownInputRules";

export type BlockShortcut =
  | { block: "heading"; level: number }
  | { block: "list"; ordered: boolean; start?: number }
  | { block: "code"; language: string }
  | { block: "quote" }
  | { block: "divider" };

/**
 * Replace the top-level paragraph whose typed Markdown prefix spans `from`–`to` with the
 * shortcut's block, keeping the paragraph's remaining content. Returns false, leaving `tr`
 * unchanged, outside a top-level paragraph or when the block cannot hold that content:
 * headings hold no line breaks, code blocks hold unmarked text only, and a divider holds nothing.
 */
export function applyBlockShortcut(tr: Transaction, from: number, to: number, shortcut: BlockShortcut): boolean {
  const $from = tr.doc.resolve(from);
  if ($from.depth !== 1 || $from.parent.type.name !== "paragraph" || $from.parentOffset !== 0) return false;
  const paragraph = $from.parent;
  const rest = paragraph.content.cut(to - $from.start());
  if (shortcut.block === "code" && !plainText(rest)) return false;
  if (shortcut.block === "heading" && hasLineBreak(rest)) return false;
  if (shortcut.block === "divider" && rest.size > 0) return false;
  const { nodes } = tr.doc.type.schema;
  const pos = $from.before();
  // A fresh locator: the snapshot paragraph is replaced, as by the equivalent command.
  const sourcePath = freshBlockPath();
  const blocks = shortcut.block === "heading" ? [nodes.heading.create({ sourcePath, level: shortcut.level }, rest)]
    : shortcut.block === "code" ? [nodes.codeBlock.create({ sourcePath, language: shortcut.language }, rest)]
    : shortcut.block === "quote" ? [nodes.quote.create({ sourcePath }, rest)]
    // Writing continues in a new paragraph below the divider.
    : shortcut.block === "divider" ? [nodes.divider.create({ sourcePath }), nodes.paragraph.create({ sourcePath: freshBlockPath() })]
    : [nodes[shortcut.ordered ? "orderedList" : "bulletList"].create(
      { sourcePath, ...(shortcut.ordered ? { start: shortcut.start ?? 1 } : {}) },
      nodes.listItem.create(null, nodes.paragraph.create(null, rest)))];
  tr.replaceWith(pos, pos + paragraph.nodeSize, blocks);
  // Inside a list the caret goes into the item's paragraph; after a divider, into the next paragraph.
  const caret = shortcut.block === "list" ? pos + 3 : shortcut.block === "divider" ? pos + blocks[0].nodeSize + 1 : pos + 1;
  tr.setSelection(TextSelection.create(tr.doc, caret));
  closeHistory(tr);
  return true;
}

function hasLineBreak(content: Fragment): boolean {
  let lineBreak = false;
  content.forEach(child => { if (child.type.name === "hardBreak") lineBreak = true; });
  return lineBreak;
}

function plainText(content: Fragment): boolean {
  let plain = true;
  content.forEach(child => { if (!child.isText || child.marks.length > 0) plain = false; });
  return plain;
}

function blockRule(find: RegExp, shortcut: (match: RegExpMatchArray) => BlockShortcut, undoable = true): InputRule {
  return new InputRule({
    find,
    undoable,
    handler: ({ state, range, match }) =>
      applyBlockShortcut(state.tr, range.from, range.to, shortcut(match)) ? undefined : null,
  });
}

/** Tiptap's mark rule would drop the delimiters even where the mark is not allowed (headings, table cells). */
function markRule(find: InputRuleFinder, type: MarkType): InputRule {
  const rule = markInputRule({ find, type });
  return new InputRule({
    find,
    handler: (props) => {
      if (!props.state.doc.resolve(props.range.from).parent.type.allowsMarkType(type)) return null;
      const result = rule.handler(props);
      closeHistory(props.state.tr);
      return result;
    },
  });
}

/**
 * `$source$` becomes inline math with that LaTeX source, like the toolbar's Inline math, keeping
 * the marks that cover it. A space just inside either dollar keeps the text: `$5 and $6` stays text.
 */
function inlineMathRule(type: NodeType): InputRule {
  return new InputRule({
    find: /(?:^|\s)(\$([^\s$](?:[^$]*[^\s$])?)\$)$/,
    handler: ({ state, range, match }) => {
      const from = range.from + match[0].length - match[1].length;
      const $from = state.doc.resolve(from);
      const $to = state.doc.resolve(range.to);
      if (!$from.sameParent($to) || !$from.parent.canReplaceWith($from.index(), $to.index(), type)) return null;
      const marks = $from.marksAcross($to) ?? [];
      state.tr.replaceWith(from, range.to, type.create({ value: match[2] }, null, marks));
      closeHistory(state.tr);
    },
  });
}

export const MarkdownInputRules = Extension.create({
  name: MARKDOWN_INPUT_RULES,
  // Ahead of Enter handling and history: a rule sees Enter first, and Undo right after a rule restores the typed text.
  priority: 1000,
  addInputRules() {
    const { marks } = this.editor.schema;
    return [
      blockRule(/^(#{1,6}) $/, match => ({ block: "heading", level: match[1].length })),
      blockRule(/^[-+*] $/, () => ({ block: "list", ordered: false })),
      blockRule(/^> $/, () => ({ block: "quote" })),
      // Applies on the third dash, in an otherwise empty paragraph.
      blockRule(/^---$/, () => ({ block: "divider" })),
      blockRule(/^(\d{1,9})\. $/, match => ({ block: "list", ordered: true, start: Number(match[1]) })),
      // A code language is one word that does not start with `{` (a MyST directive).
      blockRule(/^```((?!\{)[^\s`]*) $/, match => ({ block: "code", language: match[1] })),
      // Enter is not typed text: Undo returns to the fence as typed, without a line break.
      blockRule(/^```((?!\{)[^\s`]*)\n$/, match => ({ block: "code", language: match[1] }), false),
      markRule(/(?:^|\s)(\*\*(?!\s+\*\*)((?:[^*]+))\*\*(?!\s+\*\*))$/, marks.bold),
      markRule(/(?:^|\s)(__(?!\s+__)((?:[^_]+))__(?!\s+__))$/, marks.bold),
      markRule(/(?:^|\s)(\*(?!\s+\*)((?:[^*]+))\*(?!\s+\*))$/, marks.italic),
      markRule(/(?:^|\s)(_(?!\s+_)((?:[^_]+))_(?!\s+_))$/, marks.italic),
      markRule(/(?:^|\s)(`(?!\s+`)((?:[^`]+))`(?!\s+`))$/, marks.code),
      markRule(/(?:^|\s)(~~(?!\s+~~)((?:[^~]+))~~(?!\s+~~))$/, marks.strike),
      inlineMathRule(this.editor.schema.nodes.inlineMath),
    ];
  },
  addKeyboardShortcuts() {
    // Right after a rule, restore the typed text with the caret after it, as if the rule never applied.
    const undoRule = () => {
      const { state } = this.editor;
      const applied = state.plugins.find(plugin => plugin.spec.isInputRules)?.getState(state) as
        { from: number; text: string } | null | undefined;
      if (!applied) return false;
      return this.editor.chain().undoInputRule().setTextSelection(applied.from + applied.text.length).run();
    };
    return { "Mod-z": undoRule, Backspace: undoRule };
  },
});
