import { labelKey } from "@ieumdoc/core/label";
import { Extension } from "@tiptap/core";
import { splitBlockAs } from "@tiptap/pm/commands";
import { DOMParser as PMDOMParser, DOMSerializer, Fragment, Slice, type Node as PMNode, type DOMOutputSpec } from "@tiptap/pm/model";
import { NodeSelection, Plugin, TextSelection, type EditorState, type Transaction } from "@tiptap/pm/state";
import { freshBlockPath } from "./tiptap-document.ts";

const TYPES = new Set(["paragraph", "heading", "admonition", "quote", "divider", "equation", "figure", "table", "tableRow", "tableCell", "bulletList", "orderedList", "listItem", "codeBlock", "text", "hardBreak", "inlineMath", "crossReference"]);
const COPY_RESTRICTION = "This selection contains read-only content that cannot be copied losslessly. Use Source to copy its original Markdown. The selection is kept.";
const CUT_RESTRICTION = "This selection contains read-only content that cannot be cut losslessly. Use Source to copy its original Markdown. Nothing was removed.";

function portable(node: PMNode): boolean {
  return TYPES.has(node.type.name) &&
    (!(node.type.name === "admonition" || node.type.name === "figure") || node.attrs.editable === true) &&
    node.content.content.every(portable);
}

/** Session locators never travel with clipboard content. Engine Slice openness is retained. */
function freshSlice(slice: Slice): Slice {
  const copy = (node: PMNode): PMNode => {
    if (node.isText) return node;
    return node.type.create("sourcePath" in node.attrs ? { ...node.attrs, sourcePath: freshBlockPath(), original: null } : node.attrs,
      Fragment.fromArray(node.content.content.map(copy)), node.marks);
  };
  return new Slice(Fragment.fromArray(slice.content.content.map(copy)), slice.openStart, slice.openEnd);
}

function paragraphBeside(state: EditorState, after: boolean): Transaction {
  const { $from } = state.selection;
  const pos = state.selection instanceof NodeSelection
    ? (after ? state.selection.to : state.selection.from)
    : (after ? $from.after(1) : $from.before(1));
  const node = state.schema.nodes.paragraph.create({ sourcePath: freshBlockPath() });
  const tr = state.tr.insert(pos, node);
  return tr.setSelection(TextSelection.create(tr.doc, pos + 1)).scrollIntoView();
}

function tableTab(state: EditorState, backward: boolean): Transaction | null {
  const { $from } = state.selection;
  if ($from.depth < 3 || $from.node(1).type.name !== "table") return null;
  const cells: number[] = [];
  const start = $from.before(1);
  $from.node(1).descendants((node, pos) => { if (node.type.name === "tableCell") cells.push(start + pos + 2); });
  const index = cells.indexOf($from.start());
  const target = cells[index + (backward ? -1 : 1)];
  if (target !== undefined) return state.tr.setSelection(TextSelection.create(state.doc, target)).scrollIntoView();
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

export function documentInteraction(reject: (reason?: string) => void): Extension {
  return Extension.create({
    name: "documentInteraction",
    priority: 120,
    addKeyboardShortcuts() {
      const tab = (backward: boolean) => {
        const tr = tableTab(this.editor.state, backward);
        if (!tr) return false;
        this.editor.view.dispatch(tr); return true;
      };
      const join = (backward: boolean) => {
        const tr = joinRichProse(this.editor.state, backward);
        if (!tr) return false;
        this.editor.view.dispatch(tr); return true;
      };
      return {
        Backspace: () => join(true),
        Delete: () => join(false),
        // A native clipboard event may target the body when an AllSelection has
        // non-editable endpoints. Reject these unsupported selections at the keymap too.
        "Mod-c": () => {
          if (this.editor.state.selection.content().content.content.every(portable)) return false;
          reject(COPY_RESTRICTION); return true;
        },
        "Mod-x": () => {
          if (this.editor.state.selection.content().content.content.every(portable)) return false;
          reject(CUT_RESTRICTION); return true;
        },
        Tab: () => tab(false),
        "Shift-Tab": () => tab(true),
        Enter: () => {
          const { state, view } = this.editor;
          if (view.composing) return false;
          const { selection } = state;
          if (selection instanceof NodeSelection && selection.node.isBlock) {
            view.dispatch(paragraphBeside(state, true)); return true;
          }
          if (selection.$from.depth > 0 && ["table", "admonition", "quote"].includes(selection.$from.node(1).type.name)) {
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
          ...(type === "table" ? { contentElement: "tbody" } : {}),
        })),
        ...PMDOMParser.fromSchema(schema).rules,
      ]);
      let pasteError: string | undefined;
      const fail = (message: string) => { reject(message); return true; };
      return [new Plugin({
        view: view => {
          // Chromium may send native/menu clipboard events to the body when a
          // selection ends in a non-editable NodeView. Route this editor's focused
          // event to ProseMirror's clipboard handler, retaining the native data object.
          const restrict = (event: ClipboardEvent) => {
            if (!view.hasFocus() || view.dom.contains(event.target as globalThis.Node)) return;
            if (!view.state.selection.content().content.content.every(portable)) {
              event.preventDefault();
              reject(event.type === "cut" ? CUT_RESTRICTION : COPY_RESTRICTION);
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
          return { destroy() {
            document.removeEventListener("copy", restrict, true);
            document.removeEventListener("cut", restrict, true);
          } };
        },
        props: {
        clipboardSerializer: new DOMSerializer(serializers, DOMSerializer.marksFromSchema(schema)),
        clipboardParser: parser,
        clipboardTextSerializer: slice => slice.content.textBetween(0, slice.content.size, "\n\n", node =>
          node.type.name === "equation" ? `$$\n${node.attrs.latex}\n$$` :
          node.type.name === "inlineMath" ? `$${node.attrs.value}$` :
          node.type.name === "crossReference" ? `{${node.attrs.role}}\`${node.attrs.label}\`` :
          node.type.name === "figure" ? `![${node.attrs.imageAlt}](${node.attrs.imageUrl})` : ""),
        handleDOMEvents: {
          copy: (view, event) => {
            if (view.state.selection.content().content.content.every(portable)) return false;
            event.preventDefault(); return fail(COPY_RESTRICTION);
          },
          cut: (view, event) => {
            if (view.state.selection.content().content.content.every(portable)) return false;
            event.preventDefault(); return fail(CUT_RESTRICTION);
          },
        },
        transformPastedHTML: html => {
          pasteError = undefined;
          const document = new DOMParser().parseFromString(html, "text/html");
          const allowed = new Set(["P", "DIV", "SPAN", "S", "DEL", "H1", "H2", "H3", "H4", "H5", "H6", "STRONG", "B", "EM", "I", "A", "BR", "CODE", "TABLE", "THEAD", "TBODY", "TR", "TD", "TH"]);
          for (const element of document.body.querySelectorAll("*")) {
            const typed = element.getAttribute("data-ieumdoc-type");
            if ((!typed && (!allowed.has(element.tagName) || element.hasAttribute("style"))) ||
                (["H1", "H2", "H3", "H4", "H5", "H6"].includes(element.tagName) &&
                  (element.querySelector("strong,b,em,i,a,br,code,[data-ieumdoc-type]") || element.closest("strong,b,em,i,a,code"))) ||
                (typed && !TYPES.has(typed)) ||
                (["TABLE", "THEAD", "TBODY", "TR", "TD", "TH"].includes(element.tagName) && !element.closest('[data-ieumdoc-type="table"]')) || element.hasAttribute("colspan") || element.hasAttribute("rowspan")) {
              pasteError = "This clipboard content includes unsupported structure or formatting. Nothing was pasted; the clipboard and your selection are kept. Paste plain text explicitly or use supported content.";
              break;
            }
          }
          return html;
        },
        transformPasted: slice => freshSlice(slice),
        handlePaste: (view, event, slice) => {
          const error = event.clipboardData?.getData("text/html") ? pasteError : undefined;
          pasteError = undefined;
          if (error) return fail(error);
          if (event.clipboardData?.files.length) return fail("Pasting files is not supported. Use the Figure controls to choose an image URL. Your selection and clipboard are kept.");
          if (!slice.content.content.every(portable)) return fail("This clipboard content cannot be preserved. Nothing was pasted; your clipboard and selection are kept.");
          const target = view.state.selection.$from.parent.type.name;
          if (target === "tableCell") {
            let rich = false;
            slice.content.descendants(node => { if (node.marks.length || node.isInline && !node.isText) rich = true; });
            if (rich) return fail("This table cell supports plain text. Paste formatted content into a paragraph to keep it intact. The clipboard and selection are kept.");
          }
          if (target === "heading") {
            let lineBreak = false;
            slice.content.descendants(node => { if (node.type.name === "hardBreak") lineBreak = true; });
            if (lineBreak) return fail("A heading cannot contain line breaks. Paste into a paragraph to keep them. The clipboard and selection are kept.");
          }
          const tr = view.state.tr.replaceSelection(slice);
          const labels = new Set<string>();
          let duplicate = false;
          tr.doc.forEach(node => {
            if (!["equation", "figure"].includes(node.type.name) || !node.attrs.label) return;
            const label = labelKey(String(node.attrs.label));
            if (labels.has(label)) duplicate = true;
            labels.add(label);
          });
          return duplicate ? fail("Pasting would duplicate a Figure or Equation label. Cut the original to move it, or give it a distinct label before copying. Nothing was pasted; the clipboard is kept.") : false;
        },
      } })];
    },
  });
}
