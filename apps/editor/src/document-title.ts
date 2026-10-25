import { i18n } from "./i18n.ts";
import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import { titleHeading, type SectionMarker } from "@ieumdoc/core/section";
import { isNewBlockPath } from "./tiptap-document.ts";

/** Shown where a title change is refused and as the title's handle hint. */
export const TITLE_FIXED = "The title stays at the top of the document.";

function titleMarkers(doc: ProseMirrorNode): SectionMarker[] {
  const markers: SectionMarker[] = [];
  doc.forEach(node => markers.push(node.type.name === "labelTarget" ? "target"
    : node.type.name === "heading" ? Number(node.attrs.level) : null));
  return markers;
}

/** The engine document's title block (#255), by Core's rule: a level-1 heading that opens it. */
export function editorTitleIndex(doc: ProseMirrorNode): number | undefined {
  return titleHeading(titleMarkers(doc));
}

/**
 * Whether a change keeps the title first. A title that is still a level-1 heading must still be
 * the title; removing it or turning it into another block is an explicit change and is allowed.
 * Saved blocks are matched by their source path, a new title by its text.
 */
export function titleKept(before: ProseMirrorNode, after: ProseMirrorNode): boolean {
  const old = editorTitleIndex(before);
  if (old === undefined) return true;
  const title = before.child(old);
  const key = String(title.attrs.sourcePath ?? "");
  const matches: number[] = [];
  after.forEach((node, _, index) => {
    if (node.type.name === "heading" && Number(node.attrs.level) === 1 &&
      (key ? node.attrs.sourcePath === key : node.textContent === title.textContent)) matches.push(index);
  });
  if (matches.length === 0) return true;
  const now = editorTitleIndex(after);
  return now !== undefined && matches.includes(now);
}

const titleKey = new PluginKey("documentTitle");

/** Start an empty title at the top of a document without one, with the caret in it. */
export function addTitle(view: EditorView): void {
  const { state } = view;
  const heading = state.schema.nodes.heading.create({ level: 1 });
  const first = state.doc.firstChild;
  // The empty new-document writing space is not a second block to keep below the title.
  const reuse = state.doc.childCount === 1 && first?.type.name === "paragraph" &&
    first.content.size === 0 && isNewBlockPath(String(first.attrs.sourcePath ?? ""));
  const tr = reuse
    ? state.tr.setNodeMarkup(0, heading.type, { ...heading.attrs, sourcePath: first.attrs.sourcePath })
    : state.tr.insert(0, heading);
  view.dispatch(tr.setSelection(TextSelection.create(tr.doc, 1)).scrollIntoView());
  view.focus();
}

/**
 * The title area (#255): the title is marked, and an empty one shows what it is for. A new title
 * left empty is removed once the caret leaves it, since an empty heading is not saved. Enter in
 * the title continues in a paragraph below it, never above. (Add a title, for a document without
 * one, is rendered outside the editable content, where it cannot take the caret.)
 */
export const DocumentTitle = Extension.create({
  name: "documentTitle",
  priority: 1000,
  addKeyboardShortcuts() {
    return {
      Enter: ({ editor }) => {
        const { state } = editor;
        const { $from, empty } = state.selection;
        if (!empty || $from.depth !== 1 || $from.index(0) !== editorTitleIndex(state.doc)) return false;
        const paragraph = state.schema.nodes.paragraph;
        const tr = state.tr;
        if ($from.parentOffset === 0) {
          // Splitting here would empty the title; open the paragraph below instead.
          const after = $from.after();
          tr.insert(after, paragraph.create());
          tr.setSelection(TextSelection.create(tr.doc, after + 1));
        } else {
          tr.split($from.pos, 1, [{ type: paragraph }]);
        }
        editor.view.dispatch(tr.scrollIntoView());
        return true;
      },
    };
  },
  addProseMirrorPlugins() {
    return [new Plugin({
      key: titleKey,
      props: {
        decorations(state) {
          const title = editorTitleIndex(state.doc);
          if (title === undefined) return null;
          let pos = 0;
          for (let index = 0; index < title; index++) pos += state.doc.child(index).nodeSize;
          const node = state.doc.child(title);
          return DecorationSet.create(state.doc, [Decoration.node(pos, pos + node.nodeSize, {
            "data-document-title": "true", ...(node.content.size === 0 ? { "data-title-placeholder": i18n.t("Title") } : {}),
          })]);
        },
      },
      appendTransaction(_transactions, _old, state) {
        const title = editorTitleIndex(state.doc);
        if (title === undefined || state.doc.child(title).content.size > 0 || state.doc.childCount < 2) return null;
        // Only a title started here and never saved: emptying a saved title is an ordinary edit.
        if (!String(state.doc.child(title).attrs.sourcePath ?? "").startsWith("new:")) return null;
        const { $from } = state.selection;
        if ($from.depth >= 1 && $from.index(0) === title) return null;
        let pos = 0;
        for (let index = 0; index < title; index++) pos += state.doc.child(index).nodeSize;
        return state.tr.delete(pos, pos + state.doc.child(title).nodeSize);
      },
    })];
  },
});
