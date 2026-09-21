import { useCallback, useRef, useState } from "react";
import type { EditableBlock, EditableDocument, InlineContent, NodePath } from "@ieumdoc/core";
import { pathKey } from "./edits.ts";
import { type FocusEdge } from "./editor-focus.ts";
import { EditableText } from "./EditableText.tsx";
import { EquationEditor } from "./EquationEditor.tsx";
import { HeadingEditor } from "./HeadingEditor.tsx";
import { ParagraphEditor } from "./ParagraphEditor.tsx";

export type PendingFocus = {
  index: number;
  edge: FocusEdge;
};

type DocumentViewProps = {
  document: EditableDocument;
  headingDrafts: Record<string, string>;
  equationDrafts: Record<string, string>;
  pendingFocus: PendingFocus | null;
  onTextDraft: (path: NodePath, text: string) => void;
  onParagraphDraft: (path: NodePath, content: InlineContent[]) => void;
  onParagraphError: (path: NodePath, cause: unknown) => void;
  onHeadingDraft: (path: NodePath, text: string) => void;
  onEquationDraft: (path: NodePath, latex: string) => void;
  onInsert: (index: number, block: "paragraph" | "heading" | "equation") => void;
  onDelete: (index: number) => void;
  onEnterSplit: (path: NodePath, before: InlineContent[], after: InlineContent[]) => void;
  onParagraphBackspace: (path: NodePath, content: InlineContent[]) => void;
  onHeadingBackspace: (path: NodePath, text: string) => void;
  onEquationBackspace: (path: NodePath, latex: string) => void;
  onAutoFocusApplied: () => void;
};

export function DocumentView({
  document,
  headingDrafts,
  equationDrafts,
  pendingFocus,
  onTextDraft,
  onParagraphDraft,
  onParagraphError,
  onHeadingDraft,
  onEquationDraft,
  onInsert,
  onDelete,
  onEnterSplit,
  onParagraphBackspace,
  onHeadingBackspace,
  onEquationBackspace,
  onAutoFocusApplied,
}: DocumentViewProps) {
  const focusers = useRef(new Map<string, (edge: FocusEdge) => void>());
  const [openInsert, setOpenInsert] = useState<number | null>(null);
  const registerFocus = useCallback((key: string, focus: (edge: FocusEdge) => void) => {
    focusers.current.set(key, focus);
    return () => {
      if (focusers.current.get(key) === focus) focusers.current.delete(key);
    };
  }, []);

  function moveFocus(index: number, direction: "up" | "down"): boolean {
    const nextIndex = direction === "up" ? index - 1 : index + 1;
    const next = document.blocks[nextIndex];
    const key = next ? pathKey(next.path) : "";
    const focus = key ? focusers.current.get(key) : undefined;
    if (!next || !focus) return false;
    const edge = direction === "up" ? "end" : "start";
    // The browser restores the keydown target after the handler returns.
    window.setTimeout(() => focus(edge), 0);
    return true;
  }

  return (
    <article className="document">
      {document.blocks.map((block, index) => (
        <div key={pathKey(block.path)} className="block-row" data-testid={`block-${index}`} data-block={block.block}>
          <BlockInsert
            index={index}
            open={openInsert === index}
            onToggle={() => setOpenInsert(openInsert === index ? null : index)}
            onChoose={(kind) => {
              setOpenInsert(null);
              onInsert(index, kind);
            }}
          />
          <div className="block-actions">
            <button type="button" data-testid={`delete-${index}`} onClick={() => onDelete(index)}>
              Delete
            </button>
          </div>
          <BlockView
            block={block}
            index={index}
            headingText={headingDrafts[pathKey(block.path)] ?? (block.block === "heading" ? block.text : "")}
            equationLatex={equationDrafts[pathKey(block.path)] ?? (block.block === "equation" ? block.latex : "")}
            autoFocus={pendingFocus?.index === index ? pendingFocus.edge : null}
            onTextDraft={onTextDraft}
            onParagraphDraft={onParagraphDraft}
            onParagraphError={onParagraphError}
            onHeadingDraft={onHeadingDraft}
            onEquationDraft={onEquationDraft}
            onEnterSplit={onEnterSplit}
            onParagraphBackspace={onParagraphBackspace}
            onHeadingBackspace={onHeadingBackspace}
            onEquationBackspace={onEquationBackspace}
            onVerticalExit={(direction) => moveFocus(index, direction)}
            onRegisterFocus={(focus) => registerFocus(pathKey(block.path), focus)}
            onAutoFocusApplied={onAutoFocusApplied}
          />
        </div>
      ))}
      <BlockInsert
        index={document.blocks.length}
        open={openInsert === document.blocks.length}
        onToggle={() => setOpenInsert(openInsert === document.blocks.length ? null : document.blocks.length)}
        onChoose={(kind) => {
          setOpenInsert(null);
          onInsert(document.blocks.length, kind);
        }}
      />
    </article>
  );
}

function BlockInsert({
  index,
  open,
  onToggle,
  onChoose,
}: {
  index: number;
  open: boolean;
  onToggle: () => void;
  onChoose: (block: "paragraph" | "heading" | "equation") => void;
}) {
  return (
    <div className="block-insert">
      <button type="button" aria-label={`Add block at ${index}`} data-testid={`add-${index}`} onClick={onToggle}>
        +
      </button>
      {open ? (
        <div className="insert-choices" role="menu">
          <button type="button" data-testid={`add-paragraph-${index}`} onClick={() => onChoose("paragraph")}>
            Paragraph
          </button>
          <button type="button" data-testid={`add-heading-${index}`} onClick={() => onChoose("heading")}>
            Heading
          </button>
          <button type="button" data-testid={`add-equation-${index}`} onClick={() => onChoose("equation")}>
            Equation
          </button>
        </div>
      ) : null}
    </div>
  );
}

function BlockView({
  block,
  index,
  headingText,
  equationLatex,
  autoFocus,
  onTextDraft,
  onParagraphDraft,
  onParagraphError,
  onHeadingDraft,
  onEquationDraft,
  onEnterSplit,
  onParagraphBackspace,
  onHeadingBackspace,
  onEquationBackspace,
  onVerticalExit,
  onRegisterFocus,
  onAutoFocusApplied,
}: {
  block: EditableBlock;
  index: number;
  headingText: string;
  equationLatex: string;
  autoFocus: FocusEdge | null;
  onTextDraft: DocumentViewProps["onTextDraft"];
  onParagraphDraft: DocumentViewProps["onParagraphDraft"];
  onParagraphError: DocumentViewProps["onParagraphError"];
  onHeadingDraft: DocumentViewProps["onHeadingDraft"];
  onEquationDraft: DocumentViewProps["onEquationDraft"];
  onEnterSplit: DocumentViewProps["onEnterSplit"];
  onParagraphBackspace: DocumentViewProps["onParagraphBackspace"];
  onHeadingBackspace: DocumentViewProps["onHeadingBackspace"];
  onEquationBackspace: DocumentViewProps["onEquationBackspace"];
  onVerticalExit: (direction: "up" | "down") => boolean;
  onRegisterFocus: (focus: (edge: FocusEdge) => void) => () => void;
  onAutoFocusApplied: () => void;
}) {
  if (block.block === "heading") {
    return (
      <HeadingEditor
        level={block.level}
        text={headingText}
        testId={`heading-${index}`}
        autoFocus={autoFocus}
        onChange={(text) => onHeadingDraft(block.path, text)}
        onBackspaceAtStart={(text) => onHeadingBackspace(block.path, text)}
        onVerticalExit={onVerticalExit}
        onRegisterFocus={onRegisterFocus}
        onAutoFocusApplied={onAutoFocusApplied}
      />
    );
  }
  if (block.block === "paragraph") {
    if (block.editable) {
      return (
        <ParagraphEditor
          content={block.content}
          testId={`paragraph-${index}`}
          autoFocus={autoFocus}
          onChange={(content) => onParagraphDraft(block.path, content)}
          onError={(cause) => onParagraphError(block.path, cause)}
          onEnter={(before, after) => onEnterSplit(block.path, before, after)}
          onBackspaceAtStart={(content) => onParagraphBackspace(block.path, content)}
          onVerticalExit={onVerticalExit}
          onRegisterFocus={onRegisterFocus}
          onAutoFocusApplied={onAutoFocusApplied}
        />
      );
    }
    return <p className="paragraph paragraph-readonly">{block.text}</p>;
  }
  if (block.block === "admonition") {
    return (
      <aside className={`admonition admonition-${block.variant}`} data-variant={block.variant}>
        <p className="admonition-label">{block.variant}</p>
        <p className="admonition-body">{block.text}</p>
      </aside>
    );
  }
  if (block.block === "figure") {
    const src = block.imageUrl.startsWith("./") ? `/document/${block.imageUrl.slice(2)}` : block.imageUrl;
    return (
      <figure className="figure">
        <img src={src} alt={block.imageAlt} />
        {block.caption.editable ? (
          <EditableText
            className="caption"
            tag="figcaption"
            text={block.caption.text}
            onChange={(text) => onTextDraft(block.caption.path, text)}
          />
        ) : (
          <figcaption className="caption">{block.caption.text}</figcaption>
        )}
      </figure>
    );
  }
  if (block.block === "table") {
    const [header, ...body] = block.rows;
    return (
      <table className="table">
        {header ? (
          <thead>
            <tr>
              {header.cells.map((cell) => (
                <th key={cell.path.join(",")}>
                  <TableCellText cell={cell} onDraft={onTextDraft} />
                </th>
              ))}
            </tr>
          </thead>
        ) : null}
        <tbody>
          {body.map((row) => (
            <tr key={row.cells.map((cell) => cell.path.join(",")).join(";")}>
              {row.cells.map((cell) => (
                <td key={cell.path.join(",")}>
                  <TableCellText cell={cell} onDraft={onTextDraft} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  if (block.block === "equation") {
    return (
      <EquationEditor
        latex={equationLatex}
        label={block.label}
        testId={`equation-${index}`}
        autoFocus={autoFocus}
        onChange={(latex) => onEquationDraft(block.path, latex)}
        onBackspaceAtStart={(latex) => onEquationBackspace(block.path, latex)}
        onVerticalExit={onVerticalExit}
        onRegisterFocus={onRegisterFocus}
        onAutoFocusApplied={onAutoFocusApplied}
      />
    );
  }
  return <p className="unsupported">{block.text}</p>;
}

function TableCellText({
  cell,
  onDraft,
}: {
  cell: { path: NodePath; text: string; editable: boolean };
  onDraft: DocumentViewProps["onTextDraft"];
}) {
  if (cell.editable) {
    return (
      <EditableText
        className="cell"
        tag="span"
        text={cell.text}
        onChange={(text) => onDraft(cell.path, text)}
      />
    );
  }
  return <span className="cell">{cell.text}</span>;
}
