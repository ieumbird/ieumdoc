import type { Editor } from "@tiptap/core";
import { Link2, Sigma } from "lucide-react";
import { useState, type CSSProperties } from "react";
import { Input } from "@/components/ui/input.tsx";
import { Button, IconButton } from "./ui/primitives.tsx";

/** Inline marks for supported paragraph and admonition body selections. */
export function SelectionToolbar({ editor, style, onReject, onEditLink }: {
  editor: Editor;
  style: CSSProperties;
  onReject: () => void;
  onEditLink: () => void;
}) {
  return (
    <div className="selection-toolbar" role="toolbar" aria-label="Text formatting" style={style} data-testid="selection-toolbar">
      <IconButton
        label="Bold"
        aria-pressed={editor.isActive("bold")}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => toggleMark(editor, "bold", onReject)}
      >
        <strong aria-hidden="true">B</strong>
      </IconButton>
      <IconButton
        label="Italic"
        aria-pressed={editor.isActive("italic")}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => toggleMark(editor, "italic", onReject)}
      >
        <em aria-hidden="true">I</em>
      </IconButton>
      <IconButton
        label="Link"
        aria-pressed={editor.isActive("link")}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => (editableInlineContext(editor) ? onEditLink() : onReject())}
      >
        <Link2 aria-hidden="true" size={16} />
      </IconButton>
      <IconButton
        label="Inline math"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => (makeInlineMath(editor) ? undefined : onReject())}
      >
        <Sigma aria-hidden="true" size={16} />
      </IconButton>
    </div>
  );
}

/**
 * Turn the selected plain text into inline math whose LaTeX source is that text, keeping the
 * marks that cover the whole selection. Selections containing breaks or math are refused.
 */
export function makeInlineMath(editor: Editor): boolean {
  const { state } = editor;
  const { from, to, $from, $to } = state.selection;
  if (!editableInlineContext(editor) || from === to || !$from.sameParent($to)) return false;
  const source = state.doc.textBetween(from, to, "\n", "\n");
  if (source.length === 0 || source.includes("\n")) return false;
  const marks = $from.marksAcross($to) ?? [];
  return editor.chain().focus().insertContentAt({ from, to },
    { type: "inlineMath", attrs: { value: source }, marks: marks.map((mark) => mark.toJSON()) }).run();
}

function toggleMark(editor: Editor, mark: "bold" | "italic", onReject: () => void): void {
  if (!editableInlineContext(editor)) {
    onReject();
    return;
  }
  const chain = editor.chain().focus();
  const applied = (mark === "bold" ? chain.toggleBold() : chain.toggleItalic()).run();
  if (!applied) onReject();
}

function editableInlineContext(editor: Editor): boolean {
  const parent = editor.state.selection.$from.parent;
  return parent.type.name === "paragraph" ||
    (parent.type.name === "admonition" && parent.attrs.editable === true);
}

/** The paragraph text range a link form edits, and the link already there, if any. */
export type LinkDraft = { from: number; to: number; href: string; title: string | null };

/** Open a link draft for the selection, widened to the whole link when it is inside one. */
export function linkDraftOf(editor: Editor): LinkDraft {
  if (editor.isActive("link")) editor.commands.extendMarkRange("link");
  const { from, to } = editor.state.selection;
  const attrs = editor.getAttributes("link");
  return {
    from,
    to,
    href: typeof attrs.href === "string" ? attrs.href : "",
    title: typeof attrs.title === "string" ? attrs.title : null,
  };
}

/**
 * Add, change or remove an ordinary Markdown link on the selected text. The change is an
 * ordinary editor transaction; Core validates the link when the document is saved.
 */
export function LinkForm({ editor, draft, style, onClose }: {
  editor: Editor;
  draft: LinkDraft;
  style: CSSProperties;
  onClose: () => void;
}) {
  const [href, setHref] = useState(draft.href);
  const [error, setError] = useState("");
  const close = () => {
    onClose();
    editor.commands.focus();
  };
  const apply = () => {
    const url = href.trim();
    if (url.length === 0) return setError("Enter a URL.");
    if (/\s/.test(url)) return setError("A URL cannot contain spaces.");
    // Keep an existing title; the form edits the URL only.
    const applied = editor.chain().focus().setTextSelection({ from: draft.from, to: draft.to })
      .setLink({ href: url, title: draft.title }).run();
    if (!applied) return setError("This URL cannot be used as a link.");
    onClose();
  };
  const remove = () => {
    editor.chain().focus().setTextSelection({ from: draft.from, to: draft.to }).unsetLink().run();
    onClose();
  };
  return (
    <form
      className="selection-toolbar link-form"
      role="dialog"
      aria-label="Link"
      data-testid="link-form"
      style={style}
      onSubmit={(event) => {
        event.preventDefault();
        apply();
      }}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        close();
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onClose();
      }}
    >
      <Input
        autoFocus
        aria-label="Link URL"
        data-testid="link-url"
        placeholder="https://"
        value={href}
        aria-invalid={error ? true : undefined}
        onChange={(event) => {
          setHref(event.target.value);
          setError("");
        }}
      />
      <Button size="sm" type="submit" data-testid="link-apply">Apply</Button>
      {draft.href ? (
        <Button size="sm" variant="subtle" data-testid="link-remove" onClick={remove}>Remove</Button>
      ) : null}
      {error ? <p className="link-form-error" role="alert">{error}</p> : null}
    </form>
  );
}
