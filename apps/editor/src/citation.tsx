import { createContext, useContext, useId, useRef, useState, type CSSProperties } from "react";
import type { BibliographyEntry, BibliographyEvaluation } from "@ieumdoc/core";
import { Node, type Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";
import { NodeViewWrapper, ReactNodeViewRenderer, useEditorState, type ReactNodeViewProps } from "@tiptap/react";
import { Pencil, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { canonicalCitation, citationContentError, citationText, type CitationContent, type CitationRole } from "@ieumdoc/core/citation";
import { endnoteOrder, firstReferenceNumbers } from "@ieumdoc/core/numbering";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { useEditorVisible } from "./editor-visibility.ts";
import { endnoteBlocks } from "./endnotes.ts";
import { i18n } from "./i18n.ts";
import { useMessageState } from "./ui-message.ts";
import { useOverlayBounds } from "./ui/use-overlay-bounds.ts";

export const BibliographyContext = createContext<BibliographyEvaluation | undefined>(undefined);
export const useBibliography = () => useContext(BibliographyContext);

export function bibliographyState(status: string): string {
  switch (status) {
    case "complete": return i18n.t("Limited IEEE format");
    case "incomplete": return i18n.t("Incomplete reference");
    case "unresolved": return i18n.t("Citation key not found");
    case "duplicate": return i18n.t("Duplicate citation key");
    default: return i18n.t("Bibliography could not be verified");
  }
}

// Like endnotes, unchanged engine blocks keep their extracted references and each engine
// document computes numbers once. Only the engine-to-Core projection belongs here.
const keysOf = new WeakMap<ProseMirrorNode, string[]>();
const numbersOf = new WeakMap<ProseMirrorNode, Map<string, number>>();

export function citationNumbers(doc: ProseMirrorNode): Map<string, number> {
  let numbers = numbersOf.get(doc);
  if (!numbers) {
    const keys: string[] = [];
    endnoteOrder(endnoteBlocks(doc)).forEach(index => {
      const block = doc.child(index);
      let found = keysOf.get(block);
      if (!found) {
        // MyST reads the caption before grid cells, independently of its visual position.
        found = [];
        const visit = (node: ProseMirrorNode) => { if (node.type.name === "citation") found!.push(...node.attrs.keys); };
        if (block.type.name === "table") {
          block.lastChild?.type.name === "tableCaption" && block.lastChild.descendants(visit);
          block.forEach(row => { if (row.type.name === "tableRow") row.descendants(visit); });
        } else block.descendants(visit);
        keysOf.set(block, found);
      }
      keys.push(...found);
    });
    numbersOf.set(doc, numbers = firstReferenceNumbers(keys));
  }
  return numbers;
}

export function citationStatus(keys: readonly string[], text: string, bibliography?: BibliographyEvaluation): string {
  if (bibliography) return i18n.t("Citation {{numbers}}: {{keys}}. {{status}}.", { numbers: text, keys: keys.join(", "), status: bibliographyState(citationReadiness(keys, bibliography)) });
  return i18n.t("Citation {{numbers}}: {{keys}}. Bibliography has not been checked.", { numbers: text, keys: keys.join(", ") });
}

export function citationReadiness(keys: readonly string[], bibliography?: BibliographyEvaluation): string {
  if (!bibliography) return "not-evaluated";
  const states = keys.map(key => bibliography.references.find(reference => reference.key === key)?.status ?? "unverified");
  return states.find(state => state !== "complete") ?? "complete";
}

export function useCitationText(editor: Editor, keys: readonly string[]): string {
  return useEditorState({ editor, selector: ({ editor: current }) => current ? citationText(keys, citationNumbers(current.state.doc)) : "" }) ?? "";
}

export const Citation = Node.create({
  name: "citation",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,
  marks: "bold italic strike",
  addAttributes() {
    return {
      role: { default: "cite", parseHTML: element => element.getAttribute("data-role"),
        renderHTML: attrs => ({ "data-role": attrs.role }) },
      keys: { default: [], parseHTML: element => {
        try { return JSON.parse(element.getAttribute("data-keys") ?? "[]"); }
        catch { return []; } // The existing structural guard refuses malformed typed inline content.
      }, renderHTML: attrs => ({ "data-keys": JSON.stringify(attrs.keys) }) },
    };
  },
  parseHTML() { return [{ tag: "span[data-citation]" }]; },
  renderHTML({ HTMLAttributes }) { return ["span", { ...HTMLAttributes, "data-citation": "" }]; },
  addNodeView() { return ReactNodeViewRenderer(CitationView, { as: "span" }); },
});

function CitationView({ node, editor, getPos, updateAttributes, selected }: ReactNodeViewProps) {
  useTranslation();
  const role = node.attrs.role as CitationRole;
  const keys = node.attrs.keys as string[];
  const text = useCitationText(editor, keys);
  const bibliography = useBibliography();
  const status = citationStatus(keys, text, bibliography);
  const [editing, setEditing] = useState(false);
  const close = () => {
    setEditing(false);
    editor.commands.focus();
  };
  // Core's removal deletes the atom and keeps the surrounding text; no key text is left behind.
  const remove = () => {
    const position = getPos();
    if (typeof position !== "number") return;
    setEditing(false);
    editor.chain().focus().deleteRange({ from: position, to: position + node.nodeSize }).run();
  };
  return <NodeViewWrapper as="span" className="cross-reference citation" data-citation=""
    data-role={role} data-keys={JSON.stringify(keys)}
    data-selected={String(selected)} data-readiness={citationReadiness(keys, bibliography)}>
    <span className="cross-reference-chip" title={status} aria-label={status}>{text}</span>
    <button type="button" className="cross-reference-edit" aria-label={i18n.t("Edit citation")} title={i18n.t("Edit citation")}
      data-testid="citation-edit" onMouseDown={event => event.preventDefault()} onClick={() => setEditing(true)}>
      <Pencil aria-hidden="true" size={12} />
    </button>
    {editing ? <CitationForm className="cross-reference-form" entries={bibliography?.entries} current={{ role, keys }}
      onApply={citation => { updateAttributes({ role: citation.role, keys: citation.keys }); close(); }}
      onRemove={remove} onClose={close} onDismiss={() => setEditing(false)} /> : null}
  </NodeViewWrapper>;
}

export const CITATION_COMMAND = "citation";
const ENTRY_COMMAND = "citation:";
/** The slash menu offers matching entries directly; the form searches the whole bibliography. */
const MENU_ENTRIES = 20;

/** The slash menu's Citation item, and readable entries whose key or words start with the query. */
export function citationCommandItems(entries: readonly BibliographyEntry[] | undefined, query: string): { id: string; label: string; group: string }[] {
  const needle = query.toLowerCase().trim();
  const group = i18n.t("References");
  const items = needle.length === 0 || ["citation", "cite", "인용"].some(word => word.startsWith(needle))
    ? [{ id: CITATION_COMMAND, label: i18n.t("Citation…"), group }] : [];
  if (!needle) return items;
  const matches = (entries ?? []).filter(entry => entry.key.toLowerCase().startsWith(needle) ||
    entry.text.toLowerCase().split(/[\s\p{P}]+/u).some(word => word.startsWith(needle)));
  return [...items, ...matches.slice(0, MENU_ENTRIES).map(entry => ({ id: ENTRY_COMMAND + entry.key, label: `${entry.key} · ${entry.text}`, group }))];
}

export function citationKeyOfCommand(id: string): string | undefined {
  return id.startsWith(ENTRY_COMMAND) ? id.slice(ENTRY_COMMAND.length) : undefined;
}

/** Replace a slash query with a citation, keeping the marks a citation may carry. */
export function insertCitation(editor: Editor, range: { from: number; to: number }, citation: Omit<CitationContent, "kind">): void {
  const content = canonicalCitation({ kind: "citation", ...citation });
  const { state } = editor;
  const type = state.schema.nodes.citation;
  const marks = (state.storedMarks ?? state.doc.resolve(range.from).marks()).filter(mark => type.allowsMarkType(mark.type));
  const node = type.create({ role: content.role, keys: content.keys }, null, marks);
  const tr = state.tr.replaceWith(range.from, range.to, node);
  editor.view.dispatch(tr.setSelection(TextSelection.create(tr.doc, range.from + node.nodeSize)).scrollIntoView());
  editor.view.focus();
}

const ROLES: CitationRole[] = ["cite:p", "cite:t", "cite"];

function roleName(role: CitationRole): string {
  return role === "cite:p" ? i18n.t("Parenthetical (cite:p)") : role === "cite:t" ? i18n.t("Narrative (cite:t)") : i18n.t("Narrative, single key (cite)");
}

/**
 * Choose a role and an ordered key group. Keys come from the readable bibliography or are typed;
 * a key that is not found stays citable and shows as unresolved. Core validates and canonicalizes.
 */
export function CitationForm({ entries, current, className, style, onApply, onRemove, onClose, onDismiss }: {
  entries?: readonly BibliographyEntry[];
  current?: Omit<CitationContent, "kind">;
  className?: string;
  style?: CSSProperties;
  onApply: (citation: CitationContent) => void;
  onRemove?: () => void;
  onClose: () => void;
  onDismiss?: () => void;
}) {
  useTranslation();
  const visible = useEditorVisible();
  const id = useId();
  const keyInput = useRef<HTMLInputElement>(null);
  const [role, setRole] = useState<CitationRole>(current?.role ?? "cite:p");
  const [keys, setKeys] = useState<string[]>(current?.keys ?? []);
  const [draft, setDraft] = useState("");
  const [error, setError] = useMessageState("");
  const bounds = useOverlayBounds<HTMLFormElement>();
  const text = new Map((entries ?? []).map(entry => [entry.key, entry.text]));
  // The typed key joins the group; undefined means it was refused.
  const withDraft = (): string[] | undefined => {
    const key = draft.trim();
    if (!key) return keys;
    if (citationContentError({ kind: "citation", role, keys: [key] })) {
      setError({ key: "A citation key cannot contain spaces, commas, semicolons, braces, brackets, backticks or backslashes." });
      return undefined;
    }
    return keys.includes(key) ? keys : [...keys, key];
  };
  const add = () => {
    const next = withDraft();
    if (!next) return;
    setKeys(next);
    setDraft("");
    setError("");
  };
  const apply = () => {
    const next = withDraft();
    if (!next) return;
    if (next.length === 0) return setError({ key: "Add at least one citation key." });
    onApply(canonicalCitation({ kind: "citation", role, keys: next }));
  };
  if (!visible) return null;
  return (
    <form ref={bounds} className={`selection-toolbar reference-form citation-form ${className ?? ""}`} contentEditable={false}
      role="dialog" aria-label={i18n.t("Citation")} data-testid="citation-form" style={style}
      onSubmit={event => { event.preventDefault(); apply(); }}
      onKeyDown={event => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        onClose();
      }}
      onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget as globalThis.Node | null)) (onDismiss ?? onClose)();
      }}
    >
      <label className="form-label" htmlFor={`${id}-role`}>{i18n.t("Citation role")}</label>
      <select id={`${id}-role`} className="reference-target" data-testid="citation-role" value={role}
        onChange={event => setRole(event.target.value as CitationRole)}>
        {ROLES.map(item => <option key={item} value={item}>{roleName(item)}</option>)}
      </select>
      {keys.length > 0 ? <ol className="citation-keys" aria-label={i18n.t("Citation keys")} data-testid="citation-keys">
        {keys.map(key => <li key={key} data-key={key}>
          <span title={text.get(key)}>{key}</span>
          <button type="button" className="citation-key-remove" aria-label={i18n.t("Remove key {{key}}", { key })}
            // Focus stays in the form when its button disappears, so the form does not dismiss.
            onClick={() => { keyInput.current?.focus(); setKeys(keys.filter(item => item !== key)); }}><X aria-hidden="true" size={12} /></button>
        </li>)}
      </ol> : null}
      <label className="form-label" htmlFor={`${id}-key`}>{i18n.t("Citation key")}</label>
      <Input ref={keyInput} id={`${id}-key`} autoFocus list={`${id}-entries`} data-testid="citation-key" value={draft}
        placeholder={entries?.length ? i18n.t("Search the bibliography") : i18n.t("Type a key")}
        aria-invalid={error ? true : undefined}
        onChange={event => { setDraft(event.target.value); setError(""); }}
        onKeyDown={event => {
          if (event.key !== "Enter" || !draft.trim()) return;
          event.preventDefault();
          add();
        }} />
      {entries?.length ? <datalist id={`${id}-entries`}>
        {entries.map(entry => <option key={entry.key} value={entry.key} label={entry.text} />)}
      </datalist> : null}
      <Button size="sm" variant="outline" type="button" data-testid="citation-add" onClick={add}>{i18n.t("Add")}</Button>
      <Button size="sm" type="submit" data-testid="citation-apply">{i18n.t("Apply")}</Button>
      {onRemove ? <Button size="sm" variant="outline" type="button" data-testid="citation-remove" onClick={onRemove}>{i18n.t("Remove")}</Button> : null}
      {error ? <p className="link-form-error" role="alert">{error}</p> : null}
    </form>
  );
}
