import type { UiMessage } from "./ui-message.ts";
import { footnoteDefinitionsMarkdown, inlineContentText, planFootnotePaste, type FootnoteDefinition } from "@ieumdoc/core";
import { labelKey } from "@ieumdoc/core/label";
import { Extension, isMacOS } from "@tiptap/core";
import { splitBlockAs } from "@tiptap/pm/commands";
import { closeHistory } from "@tiptap/pm/history";
import { GapCursor } from "@tiptap/pm/gapcursor";
import { DOMParser as PMDOMParser, DOMSerializer, Fragment, Slice, type Node as PMNode, type DOMOutputSpec, type Schema } from "@tiptap/pm/model";
import { AllSelection, NodeSelection, Plugin, TextSelection, type EditorState, type Transaction } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { ASSET_FORMATS } from "../shared/asset-policy.ts";
import { addTableRowBelow, changeHeadingLevel, TABLE_DELETE_META } from "./block-commands.ts";
import { normalizeExternalHTML, type ExternalHTML } from "./external-html.ts";
import { freshBlockPath, TABLE_CELL_SOURCE_ATTR } from "./tiptap-document.ts";
import { REDO_SHORTCUT, UNDO_SHORTCUT } from "./shortcuts.ts";
import { canEditEndnoteAt } from "./endnotes.ts";
import { fromTiptapContent, toTiptapContent } from "./tiptap-inline.ts";

const FOOTNOTES_ATTR = "data-ieumdoc-footnotes";

function referenceLabels(fragment: Fragment): string[] {
  const labels = new Set<string>();
  fragment.descendants(node => { if (node.type.name === "footnoteReference") labels.add(String(node.attrs.label)); });
  return [...labels];
}

function definitionsOf(doc: PMNode): FootnoteDefinition[] {
  const definitions: FootnoteDefinition[] = [];
  doc.forEach(node => {
    if (node.type.name === "footnoteDefinition") definitions.push({ label: String(node.attrs.label),
      content: fromTiptapContent({ type: "doc", content: [{ type: "paragraph", content: node.toJSON().content }] }) });
  });
  return definitions;
}

/** Capture every selected reference's definition before a cut can delete anything. */
export function clipboardFootnotes(doc: PMNode, slice: Slice): FootnoteDefinition[] {
  const definitions = definitionsOf(doc);
  return referenceLabels(slice.content).map(label => {
    const definition = definitions.find(note => note.label === label);
    if (!definition) throw new Error("The selected endnote has no definition.");
    return definition;
  });
}

/** Apply Core's clipboard plan only to the incoming slice, then insert missing definitions
 * with fresh session locators in the same transaction as the paste. */
export function pasteFootnotes(state: EditorState, slice: Slice, incoming: FootnoteDefinition[], tr = closeHistory(state.tr)): Transaction {
  const references = referenceLabels(slice.content);
  if (!references.length) return tr.replaceSelection(slice);
  if (references.some(label => !incoming.some(note => note.label === label))) throw new Error("Clipboard endnote definition is missing.");
  const existing = definitionsOf(state.doc);
  const labels = [...referenceLabels(state.doc.content), ...existing.map(note => note.label)];
  const plan = planFootnotePaste(labels, existing, incoming.filter(note => references.includes(note.label)));
  const rename = new Map(plan.labels.map(item => [item.from, item.to]));
  const copy = (node: PMNode): PMNode => node.isText ? node : node.type.create(
    node.type.name === "footnoteReference" ? { ...node.attrs, label: rename.get(String(node.attrs.label)) ?? node.attrs.label } : node.attrs,
    Fragment.fromArray(node.content.content.map(copy)), node.marks);
  tr.replaceSelection(new Slice(Fragment.fromArray(slice.content.content.map(copy)), slice.openStart, slice.openEnd));
  for (const note of plan.definitions) {
    const content = state.schema.nodeFromJSON(toTiptapContent(note.content)).firstChild!.content;
    tr.insert(tr.doc.content.size, state.schema.nodes.footnoteDefinition.create({ label: note.label, sourcePath: freshBlockPath() }, content));
  }
  return tr;
}

const TYPES = new Set(["paragraph", "heading", "admonition", "quote", "divider", "equation", "figure", "table", "tableRow", "tableCell", "tableCaption", "bulletList", "orderedList", "listItem", "codeBlock", "text", "hardBreak", "inlineMath", "crossReference", "footnoteReference", "citation"]);
const COPY_RESTRICTION = "This selection cannot be copied losslessly. Use Source to copy its original Markdown. The selection is kept.";
const CUT_RESTRICTION = "This selection cannot be cut losslessly. Use Source to copy its original Markdown. Nothing was removed.";

/** These NodeViews each expose one inline editing surface in the shared document. */
function selectAllScope(state: EditorState): { from: number; to: number } | undefined {
  const { selection } = state;
  if (!(selection instanceof TextSelection) || !selection.$from.sameParent(selection.$to) ||
      !["tableCell", "tableCaption", "figure", "footnoteDefinition"].includes(selection.$from.parent.type.name) ||
      !canEditEndnoteAt(state, selection.from)) return undefined;
  return { from: selection.$from.start(), to: selection.$from.end() };
}

/** Use the real keymap order (including input-rule Undo), with full native transactions. */
export function runHistoryShortcut(view: EditorView, shortcut: typeof UNDO_SHORTCUT): boolean {
  const mac = isMacOS();
  const event = new KeyboardEvent("keydown", { key: shortcut.key, ctrlKey: !mac, metaKey: mac });
  return Boolean(view.someProp("handleKeyDown", handler => handler(view, event)));
}

export function isInternalClipboard(html: string): boolean {
  return /\bdata-ieumdoc-type\s*=/.test(html);
}

/** IeumDoc's own clipboard must hold only typed content it can paste losslessly. */
function internalPasteError(html: string, schema: Schema): UiMessage | undefined {
  const document = new DOMParser().parseFromString(html, "text/html");
  const allowed = new Set(["P", "DIV", "SPAN", "S", "DEL", "H1", "H2", "H3", "H4", "H5", "H6", "STRONG", "B", "EM", "I", "A", "BR", "CODE", "TABLE", "THEAD", "TBODY", "TR", "TD", "TH"]);
  // Content of a typed textblock must be what its schema allows: marks and inline atoms in a heading,
  // but no line break in a heading or cell and no block inside text.
  const misplaced = (element: Element, typed: string) => {
    const type = schema.nodes[typed], parent = schema.nodes[element.parentElement?.closest("[data-ieumdoc-type]")?.getAttribute("data-ieumdoc-type") ?? ""];
    return Boolean(type && parent?.isTextblock && !parent.contentMatch.matchType(type));
  };
  for (const element of document.body.querySelectorAll("*")) {
    const typed = element.getAttribute("data-ieumdoc-type");
    // The Figure's typed attrs own its image; only its figcaption is parsed as content.
    if (["IMG", "FIGCAPTION"].includes(element.tagName) && element.closest('[data-ieumdoc-type="figure"]')) continue;
    if ((!typed && (!allowed.has(element.tagName) || element.hasAttribute("style"))) ||
        (typed && !TYPES.has(typed)) || misplaced(element, typed ?? (element.tagName === "BR" ? "hardBreak" : "")) ||
        (["TABLE", "THEAD", "TBODY", "TR", "TD", "TH"].includes(element.tagName) && !element.closest('[data-ieumdoc-type="table"]')) || element.hasAttribute("colspan") || element.hasAttribute("rowspan")) {
      return { key: "This clipboard content includes unsupported structure or formatting. Nothing was pasted; the clipboard and your selection are kept. Paste plain text explicitly or use supported content." };
    }
  }
  return undefined;
}

function portable(node: PMNode): boolean {
  return TYPES.has(node.type.name) &&
    node.content.content.every(portable);
}

/** Session locators never travel with clipboard content. Engine Slice openness is retained. */
function freshSlice(slice: Slice): Slice {
  const copy = (node: PMNode): PMNode => {
    if (node.isText) return node;
    return node.type.create("sourcePath" in node.attrs ? { ...node.attrs, sourcePath: freshBlockPath() }
      : TABLE_CELL_SOURCE_ATTR in node.attrs ? { ...node.attrs, [TABLE_CELL_SOURCE_ATTR]: "" } : node.attrs,
      Fragment.fromArray(node.content.content.map(copy)), node.marks);
  };
  return new Slice(Fragment.fromArray(slice.content.content.map(copy)), slice.openStart, slice.openEnd);
}

/** External content joins the text around the selection only through a paragraph edge. Other
 * edge blocks (headings, lists, code) stay whole instead of merging into or absorbing that text. */
function closeExternalSlice(slice: Slice): Slice {
  const open = (node: PMNode | null, depth: number) => depth === 1 && node?.type.name === "paragraph" ? 1 : 0;
  return new Slice(slice.content, open(slice.content.firstChild, slice.openStart), open(slice.content.lastChild, slice.openEnd));
}

function paragraphBeside(state: EditorState, after: boolean): Transaction {
  const { $from } = state.selection;
  let pos = state.selection instanceof NodeSelection
    ? (after ? state.selection.to : state.selection.from)
    : (after ? $from.after(1) : $from.before(1));
  if (state.selection instanceof NodeSelection && state.selection.node.type.name === "footnoteDefinition") {
    state.doc.forEach((node, at) => { if (node.type.name === "footnoteDefinition") pos = Math.min(pos, at); });
  }
  const node = state.schema.nodes.paragraph.create({ sourcePath: freshBlockPath() });
  const tr = state.tr.insert(pos, node);
  return tr.setSelection(TextSelection.create(tr.doc, pos + 1)).scrollIntoView();
}

/** A selected preview has no text caret; text input must leave it and the document unchanged. */
function selectedPreview(state: EditorState): boolean {
  return state.selection instanceof NodeSelection &&
    ["equation", "figure", "footnoteDefinition"].includes(state.selection.node.type.name);
}

function fullCaptionRange(state: EditorState, from: number, to: number): boolean {
  const $from = state.doc.resolve(from), $to = state.doc.resolve(to);
  return $from.sameParent($to) && ["figure", "tableCaption"].includes($from.parent.type.name) &&
    from === $from.start() && to === $from.end() && from < to;
}

/** The caret goes to the end of a final paragraph. After any other final block, it goes to a new empty paragraph. */
export function documentEnd(state: EditorState): Transaction {
  const end = state.doc.content.size;
  if (state.doc.lastChild?.type.name === "paragraph") return state.tr.setSelection(TextSelection.create(state.doc, end - 1)).scrollIntoView();
  const tr = state.tr.insert(end, state.schema.nodes.paragraph.create({ sourcePath: freshBlockPath() }));
  return tr.setSelection(TextSelection.create(tr.doc, end + 1)).scrollIntoView();
}

/** Whether the caret is on the last line of a nested block (table row, list, quote, caption) that ends the document. */
function atNestedDocumentEnd(view: EditorView): boolean {
  const { state } = view, { selection } = state, { $from } = selection;
  if (!selection.empty || $from.depth < 2 || $from.after(1) !== state.doc.content.size) return false;
  const lastLine = $from.node(1).type.name === "table"
    ? $from.index(1) === $from.node(1).childCount - 1
    : !TextSelection.findFrom(state.doc.resolve($from.after()), 1, true);
  return lastLine && view.endOfTextblock("down");
}

function tableTab(state: EditorState, backward: boolean, editable: boolean): Transaction | null {
  const { $from } = state.selection;
  if ($from.depth < 3 || $from.node(1).type.name !== "table") return null;
  const cells: number[] = [];
  const start = $from.before(1);
  $from.node(1).descendants((node, pos) => { if (node.type.name === "tableCell") cells.push(start + pos + 2); });
  const index = cells.indexOf($from.start());
  const target = cells[index + (backward ? -1 : 1)];
  if (target !== undefined) return state.tr.setSelection(TextSelection.create(state.doc, target)).scrollIntoView();
  if (!backward && editable) return addTableRowBelow(state, $from.index(0), { row: $from.index(1), column: 0 });
  const edge = backward ? $from.before(1) : $from.after(1);
  const selection = TextSelection.findFrom(state.doc.resolve(edge), backward ? -1 : 1, true);
  return selection ? state.tr.setSelection(selection).scrollIntoView() : paragraphBeside(state, !backward);
}

/** A heading cannot hold line breaks. Joining prose that has them therefore uses
 * the paragraph type and ProseMirror's normal join transform. */
export function joinRichProse(state: EditorState, backward: boolean): Transaction | null {
  const { selection } = state;
  if (!selection.empty || selection.$from.depth !== 1) return null;
  const { $from } = selection;
  if ($from.parentOffset !== (backward ? 0 : $from.parent.content.size)) return null;
  const boundary = backward ? $from.before() : $from.after();
  const $boundary = state.doc.resolve(boundary);
  const left = $boundary.nodeBefore, right = $boundary.nodeAfter;
  if (left?.type.name !== "heading" || right?.type.name !== "paragraph" ||
      !right.content.content.some(node => node.type.name === "hardBreak")) return null;
  const tr = state.tr.setNodeMarkup(boundary - left.nodeSize, state.schema.nodes.paragraph, left.attrs).join(boundary);
  return tr.setSelection(TextSelection.create(tr.doc, boundary - 1)).scrollIntoView();
}

export function documentInteraction(reject: (reason?: UiMessage) => void): Extension {
  return Extension.create({
    name: "documentInteraction",
    priority: 120,
    addKeyboardShortcuts() {
      // State identity also distinguishes first/second presses in an empty surface.
      // Any intervening transaction (typing, pointer selection, history) starts afresh.
      let scopedState: EditorState | undefined;
      const end = () => {
        const { view } = this.editor;
        view.dispatch(documentEnd(view.state)); return true;
      };
      const tab = (backward: boolean) => {
        const { state, view } = this.editor;
        if (view.composing) return false;
        const tr = tableTab(state, backward, this.editor.isEditable);
        if (tr) { view.dispatch(tr); return true; }
        const { selection } = state, { $from } = selection;
        // Selected text keeps its toolbar Tab; only an editable top-level heading caret changes level.
        if (!this.editor.isEditable || !selection.empty || $from.depth !== 1 || $from.parent.type.name !== "heading") return false;
        const level = Number($from.parent.attrs.level) + (backward ? -1 : 1);
        if (level >= 1 && level <= 6) view.dispatch(changeHeadingLevel(state, $from.index(0), level));
        // H1 and H6 boundaries retain focus.
        return true;
      };
      const join = (backward: boolean) => {
        const { state, commands } = this.editor;
        const selection = state.selection;
        if (this.editor.isEditable && !this.editor.view.composing && backward && selection instanceof TextSelection &&
            selection.empty && selection.$from.parentOffset === 0 &&
            ["figure", "tableCaption"].includes(selection.$from.parent.type.name)) return true;
        if (state.selection instanceof NodeSelection && state.selection.node.type.name === "table") {
          this.editor.view.dispatch(closeHistory(state.tr).deleteSelection().setMeta(TABLE_DELETE_META, true).scrollIntoView());
          return true;
        }
        // Whole-document deletion must not merge with a just-applied property edit or insertion.
        // Use the engine's deletion and history boundary so one Undo restores the exact document.
        if (state.selection instanceof AllSelection) {
          this.editor.view.dispatch(closeHistory(state.tr).deleteSelection().scrollIntoView());
          return true;
        }
        const { $from } = state.selection;
        // Before the engine join can delete an adjacent atom, show its normal node
        // selection. Keep empty-block removal, list lifting and isolating boundaries.
        if ($from.depth === 1 && $from.parent.content.size > 0 &&
            ["paragraph", "heading"].includes($from.parent.type.name)) {
          const adjacent = state.doc.resolve(backward ? $from.before() : $from.after());
          const node = backward ? adjacent.nodeBefore : adjacent.nodeAfter;
          if (node?.isAtom && (backward ? commands.selectNodeBackward() : commands.selectNodeForward())) return true;
        }
        const tr = joinRichProse(this.editor.state, backward);
        if (!tr) return false;
        this.editor.view.dispatch(tr); return true;
      };
      return {
        "Mod-a": () => {
          const { view, isEditable } = this.editor;
          const { state } = view;
          if (!isEditable || view.composing || state === scopedState) return false;
          const scope = selectAllScope(state);
          if (!scope) return false;
          view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, scope.from, scope.to)));
          scopedState = view.state;
          return true;
        },
        Backspace: () => join(true),
        Delete: () => join(false),
        // A native clipboard event may target the body when an AllSelection has
        // non-editable endpoints. Reject these unsupported selections at the keymap too.
        "Mod-c": () => {
          if (this.editor.state.selection.content().content.content.every(portable)) return false;
          reject({ key: COPY_RESTRICTION }); return true;
        },
        "Mod-x": () => {
          if (this.editor.state.selection.content().content.content.every(portable)) return false;
          reject({ key: CUT_RESTRICTION }); return true;
        },
        Tab: () => tab(false),
        "Shift-Tab": () => tab(true),
        "Mod-End": end,
        ...(isMacOS() ? { "Mod-ArrowDown": end } : {}),
        // Closed final blocks (including the gap after Apply) have no line below them either.
        ArrowUp: () => {
          const { view, state } = this.editor;
          const { selection } = state;
          const { $from } = selection;
          if (!selection.empty || $from.parent.type.name !== "tableCaption" || !view.endOfTextblock("up")) return false;
          const cell = TextSelection.findFrom(state.doc.resolve($from.before()), -1, true);
          if (!cell) return false;
          view.dispatch(state.tr.setSelection(cell).scrollIntoView()); return true;
        },
        ArrowDown: () => {
          const { view } = this.editor;
          const { selection, doc } = view.state;
          const { $from } = selection;
          if (selection.empty && $from.parent.type.name === "tableCell" &&
              $from.node(1).lastChild?.type.name === "tableCaption" &&
              $from.index(1) === $from.node(1).childCount - 2 && view.endOfTextblock("down")) {
            const caption = $from.after(2) + 1;
            view.dispatch(view.state.tr.setSelection(TextSelection.create(doc, caption)).scrollIntoView()); return true;
          }
          const finalBlock = selection.to === doc.content.size &&
            (selection instanceof GapCursor || selection instanceof NodeSelection && selection.node.isBlock);
          if (!finalBlock && !atNestedDocumentEnd(view)) return false;
          view.dispatch(documentEnd(view.state)); return true;
        },
        Enter: () => {
          const { state, view } = this.editor;
          if (view.composing) return false;
          const { selection } = state;
          if (selection instanceof NodeSelection && selection.node.isBlock) {
            view.dispatch(paragraphBeside(state, true)); return true;
          }
          if (selection.$from.depth > 0 && ["table", "admonition", "quote", "footnoteDefinition", "figure"].includes(selection.$from.node(1).type.name)) {
            if (!selection.empty) return false;
            view.dispatch(paragraphBeside(state, true)); return true;
          }
          if (selection.$from.parent.type.name === "heading") {
            if (selection.empty && selection.$from.parentOffset === 0) {
              view.dispatch(selection.$from.parent.content.size === 0
                ? state.tr.setNodeMarkup(selection.$from.before(), state.schema.nodes.paragraph, { sourcePath: freshBlockPath() })
                : paragraphBeside(state, false));
              return true;
            }
            return splitBlockAs((node, atEnd) => atEnd || node.content.size === 0
              ? { type: state.schema.nodes.paragraph, attrs: { sourcePath: freshBlockPath() } }
              : { type: node.type, attrs: { ...node.attrs, sourcePath: freshBlockPath() } })(state, view.dispatch);
          }
          return false;
        },
      };
    },
    addProseMirrorPlugins() {
      const schema = this.editor.schema;
      const serializers = DOMSerializer.nodesFromSchema(schema);
      for (const [type, serialize] of Object.entries(serializers)) {
        if (type === "text") continue;
        serializers[type] = node => {
          const spec = serialize(node) as readonly unknown[];
          const attrs = typeof spec[1] === "object" && !Array.isArray(spec[1]) ? spec[1] : {};
          const children = attrs === spec[1] ? spec.slice(2) : spec.slice(1);
          return [spec[0], { ...attrs, "data-ieumdoc-type": type, "data-ieumdoc-attrs": JSON.stringify(node.attrs) }, ...children] as DOMOutputSpec;
        };
      }
      const parser = new PMDOMParser(schema, [
        ...Object.keys(serializers).filter(type => type !== "text").map(type => ({
          tag: `[data-ieumdoc-type="${type}"]`, node: type,
          getAttrs: (element: HTMLElement) => {
            try { return JSON.parse(element.getAttribute("data-ieumdoc-attrs") ?? "{}"); } catch { return false; }
          },
          ...(type === "table" ? { contentElement: "table" } : type === "figure" ? { contentElement: "figcaption" } : {}),
        })),
        ...PMDOMParser.fromSchema(schema).rules,
      ]);
      // Parsing (transformPastedHTML) precedes handlePaste/handleDrop for the same clipboard data.
      let pasted: (Omit<ExternalHTML, "error"> & { error?: UiMessage }) | undefined;
      let external = false;
      // Shown once the engine's paste transaction is applied; the structure guard may still refuse it.
      let pastedNotice: string | undefined;
      let pastedFootnotes: FootnoteDefinition[] = [];
      const fail = (message: UiMessage) => { reject(message); return true; };
      const copyWithFootnotes = (view: EditorView, event: ClipboardEvent, cut: boolean): boolean => {
        const slice = view.state.selection.content();
        const restriction: UiMessage = { key: cut ? CUT_RESTRICTION : COPY_RESTRICTION };
        if (!slice.content.content.every(portable)) { event.preventDefault(); return fail(restriction); }
        if (!referenceLabels(slice.content).length) return false;
        event.preventDefault();
        try {
          const notes = clipboardFootnotes(view.state.doc, slice);
          const markdown = footnoteDefinitionsMarkdown(notes);
          const { dom, text } = view.serializeForClipboard(slice);
          if (!event.clipboardData || !dom.firstElementChild) throw new Error("Clipboard unavailable");
          dom.firstElementChild.setAttribute(FOOTNOTES_ATTR, JSON.stringify(notes));
          event.clipboardData.setData("text/html", dom.innerHTML);
          const plain = `${text}\n\n${markdown}`;
          event.clipboardData.setData("text/plain", plain);
          if (event.clipboardData.getData("text/html") !== dom.innerHTML || event.clipboardData.getData("text/plain") !== plain) throw new Error("Clipboard write failed");
          if (cut && view.editable) view.dispatch(closeHistory(view.state.tr).deleteSelection().scrollIntoView().setMeta("uiEvent", "cut"));
          return true;
        } catch { return fail(restriction); }
      };
      // A selected block has no native text caret. Keep the DOM read-only for that
      // selection, while the engine remains editable for explicit keymaps/clipboard.
      const syncPreviewInput = (view: EditorView) => {
        view.dom.contentEditable = String(view.editable && !selectedPreview(view.state));
      };
      const rejectPreviewComposition = (view: EditorView) => {
        if (!selectedPreview(view.state)) return false;
        syncPreviewInput(view);
        return true;
      };
      return [new Plugin({
        view: view => {
          syncPreviewInput(view);
          // Chromium may send native/menu clipboard events to the body when a
          // selection ends in a non-editable NodeView. Route this editor's focused
          // event to ProseMirror's clipboard handler, retaining the native data object.
          const restrict = (event: ClipboardEvent) => {
            if (!view.hasFocus() || view.dom.contains(event.target as globalThis.Node)) return;
            if (!view.state.selection.content().content.content.every(portable)) {
              event.preventDefault();
              reject({ key: event.type === "cut" ? CUT_RESTRICTION : COPY_RESTRICTION });
              return;
            }
            if (!event.clipboardData) return;
            const forwarded = new ClipboardEvent(event.type, { clipboardData: event.clipboardData, bubbles: true, cancelable: true });
            view.dom.dispatchEvent(forwarded);
            if (forwarded.defaultPrevented) event.preventDefault();
          };
          const document = view.dom.ownerDocument;
          document.addEventListener("copy", restrict, true);
          document.addEventListener("cut", restrict, true);
          return {
            // The notice shares the restriction message channel.
            update(view, previous) {
              syncPreviewInput(view);
              if (pastedNotice && view.state.doc !== previous.doc) reject(pastedNotice);
              pastedNotice = undefined;
            },
            destroy() {
              document.removeEventListener("copy", restrict, true);
              document.removeEventListener("cut", restrict, true);
            },
          };
        },
        props: {
        // A native focus caret cannot turn a read-only block selection into title text.
        // Property navigation enables native input before delegating to the engine's gap cursor.
        createSelectionBetween: (view, anchor, head) => anchor.pos === head.pos && view.hasFocus() &&
          !view.dom.isContentEditable && selectedPreview(view.state) ? view.state.selection : null,
        clipboardSerializer: new DOMSerializer(serializers, DOMSerializer.marksFromSchema(schema)),
        clipboardParser: parser,
        clipboardTextSerializer: slice => slice.content.textBetween(0, slice.content.size, "\n\n", node =>
          node.type.name === "equation" ? `$$\n${node.attrs.latex}\n$$` :
          node.type.name === "inlineMath" ? `$${node.attrs.value}$` :
          node.type.name === "crossReference" ? `{${node.attrs.role}}\`${node.attrs.label}\`` :
          node.type.name === "footnoteReference" ? `[^${node.attrs.label}]` :
          node.type.name === "citation" ? inlineContentText([{ kind: "citation", role: node.attrs.role, keys: node.attrs.keys }]) :
          node.type.name === "figure" ? `![${node.attrs.imageAlt}](${node.attrs.imageUrl})` : ""),
        handleDOMEvents: {
          mousedown: (view, event) => {
            // Let an actual pointer place a text caret before the browser's default action.
            const target = event.target instanceof Element ? event.target : null;
            const readonly = target?.closest('[contenteditable="false"]');
            if (event.button === 0 && (!readonly || readonly === view.dom) &&
                !target?.closest('[data-testid="footnote-definition"][aria-readonly="true"]')) {
              view.dom.contentEditable = String(view.editable);
            }
            return false;
          },
          beforeinput: (view, event) => {
            if (selectedPreview(view.state) && /^(insert|delete)/.test(event.inputType)) {
              syncPreviewInput(view);
              if (event.cancelable) event.preventDefault();
              return true;
            }
            if (!this.editor.isEditable || view.composing || event.isComposing || !event.cancelable) return false;
            const insert = event.inputType === "insertText" || event.inputType === "insertReplacementText";
            if (!insert && !event.inputType.startsWith("delete")) return false;
            if (insert && typeof event.data !== "string") return false;
            let ranges: StaticRange[];
            try {
              if (typeof event.getTargetRanges !== "function") return false;
              ranges = event.getTargetRanges();
            } catch { return false; }
            if (ranges.length !== 1) return false;
            const range = ranges[0]!;
            let from: number, to: number;
            try {
              from = view.posAtDOM(range.startContainer, range.startOffset);
              to = view.posAtDOM(range.endContainer, range.endOffset);
            } catch { return false; }
            if (!fullCaptionRange(view.state, from, to)) return false;
            // Chrome can remove the React-owned wrappers while replacing a whole rich caption.
            // Use the browser's exact target range and ProseMirror's normal transaction/history.
            event.preventDefault();
            view.dispatch((insert ? view.state.tr.insertText(event.data!, from, to) : view.state.tr.delete(from, to)).scrollIntoView());
            return true;
          },
          keydown: (view, event) => {
            // ProseMirror skips keymaps during composition. Consume the shortcut here
            // so Chromium cannot select the whole document behind the composing range.
            if (this.editor.isEditable && (view.composing || event.isComposing) && selectAllScope(view.state) &&
                !event.altKey && !event.shiftKey && (isMacOS() ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey) &&
                (event.key.toLowerCase() === "a" || ["Process", "Unidentified"].includes(event.key) && event.code === "KeyA")) {
              event.preventDefault();
              return true;
            }
            // Native range extension still needs an editable selection surface.
            // Let the existing engine/browser navigation place that range, without
            // admitting character input or releasing on composition-cancel keys.
            if (selectedPreview(view.state) && /^(Arrow(Left|Right|Up|Down)|Home|End)$/.test(event.key)) {
              view.dom.contentEditable = String(view.editable);
              view.focus();
            }
            if (!isMacOS() && this.editor.isEditable && !view.composing && event.ctrlKey && !event.metaKey) {
              const shortcut = UNDO_SHORTCUT.matches(event, { opaqueOnly: true }) ? UNDO_SHORTCUT
                : REDO_SHORTCUT.matches(event, { opaqueOnly: true }) ? REDO_SHORTCUT : undefined;
              if (shortcut) {
                // IME Process/229 has no character for the engine keymap to resolve.
                // Reuse that keymap, including Markdown input-rule Undo, with a visible key.
                runHistoryShortcut(view, shortcut);
                event.preventDefault();
                return true;
              }
            }
            return false;
          },
          compositionstart: view => {
            if (rejectPreviewComposition(view)) return true;
            const { from, to } = view.state.selection;
            // Empty the selected caption through the engine before Chromium's noncancelable
            // composition replacement can remove its NodeView contentDOM wrappers.
            if (this.editor.isEditable && fullCaptionRange(view.state, from, to)) view.dispatch(view.state.tr.delete(from, to));
            return false;
          },
          compositionupdate: rejectPreviewComposition,
          copy: (view, event) => {
            return copyWithFootnotes(view, event, false);
          },
          cut: (view, event) => {
            return copyWithFootnotes(view, event, true);
          },
        },
        // IeumDoc's typed clipboard is pasted as is; other HTML is normalized to supported structure first.
        transformPastedHTML: html => {
          pastedFootnotes = [];
          external = !isInternalClipboard(html);
          pasted = external ? normalizeExternalHTML(html) : { html, error: internalPasteError(html, schema) };
          if (!external) {
            try {
              const value = new DOMParser().parseFromString(html, "text/html").querySelector(`[${FOOTNOTES_ATTR}]`)?.getAttribute(FOOTNOTES_ATTR);
              if (value) {
                const notes: unknown = JSON.parse(value);
                if (!Array.isArray(notes)) throw new Error("Invalid footnotes");
                footnoteDefinitionsMarkdown(notes);
                pastedFootnotes = notes;
              }
            } catch { pasted.error = { key: "This clipboard content cannot be preserved. Nothing was pasted; your clipboard and selection are kept." }; }
          }
          return pasted.html;
        },
        transformPasted: slice => freshSlice(external ? closeExternalSlice(slice) : slice),
        handleDrop: (_view, _event, _slice, moved) => {
          pastedFootnotes = [];
          const { error, notice } = moved ? {} : pasted ?? {};
          pasted = undefined;
          external = false;
          if (error) return fail(error);
          pastedNotice = notice;
          return false;
        },
        // Consume ordinary text on selected previews without replacing content or adding space.
        // Text carets and explicit property inputs retain their existing input paths.
        handleTextInput(view, _from, _to, text) {
          return !!text && selectedPreview(view.state);
        },
        handlePaste: (view, event, slice) => {
          const notes = pastedFootnotes;
          pastedFootnotes = [];
          const { error, notice } = event.clipboardData?.getData("text/html") ? pasted ?? {} : {};
          pasted = undefined;
          external = false;
          if (error) return fail(error);
          if (event.clipboardData?.files.length && !isInternalClipboard(event.clipboardData.getData("text/html"))) return fail(`Add one ${ASSET_FORMATS} image at a time. Your selection and clipboard are kept.`);
          if (!slice.content.content.every(portable)) return fail({ key: "This clipboard content cannot be preserved. Nothing was pasted; your clipboard and selection are kept." });
          const target = view.state.selection.$from.parent.type.name;
          if (target === "heading" || target === "tableCell" || target === "tableCaption") {
            let lineBreak = false;
            slice.content.descendants(node => { if (node.type.name === "hardBreak") lineBreak = true; });
            if (lineBreak) return fail(`A ${target === "heading" ? "heading" : target === "tableCaption" ? "table caption" : "table cell"} cannot contain line breaks. Paste into a paragraph to keep them. The clipboard and selection are kept.`);
          }
          const { selection } = view.state;
          const besideEquation = selection instanceof NodeSelection && selection.node.type.name === "equation";
          // Consume empty accepted content: delegating a non-null empty Slice deletes the selection.
          if (besideEquation && !slice.size) return true;
          let tr: Transaction;
          try {
            tr = pasteFootnotes(view.state, slice, notes, besideEquation ? paragraphBeside(view.state, true) : closeHistory(view.state.tr));
          } catch { return fail({ key: "This clipboard content cannot be preserved. Nothing was pasted; your clipboard and selection are kept." }); }
          const labels = new Set<string>();
          let duplicate = false;
          tr.doc.forEach(node => {
            if (!["equation", "figure"].includes(node.type.name) || !node.attrs.label) return;
            const label = labelKey(String(node.attrs.label));
            if (labels.has(label)) duplicate = true;
            labels.add(label);
          });
          if (duplicate) return fail({ key: "Pasting would duplicate a Figure or Equation label. Cut the original to move it, or give it a distinct label before copying. Nothing was pasted; the clipboard is kept." });
          pastedNotice = notice;
          if (besideEquation || notes.length || referenceLabels(slice.content).length) {
            view.dispatch(tr.scrollIntoView().setMeta("paste", true).setMeta("uiEvent", "paste"));
            return true;
          }
          return false;
        },
      } })];
    },
  });
}
