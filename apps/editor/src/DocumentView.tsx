import type { EditableBlock, EditableDocument, InlineContent, NodePath } from "@ieumdoc/core";
import { EditableText } from "./EditableText.tsx";
import { ParagraphEditor } from "./ParagraphEditor.tsx";

type DocumentViewProps = {
  document: EditableDocument;
  onTextDraft: (path: NodePath, text: string) => void;
  onParagraphDraft: (path: NodePath, content: InlineContent[]) => void;
  onParagraphError: (path: NodePath, cause: unknown) => void;
};

export function DocumentView({ document, onTextDraft, onParagraphDraft, onParagraphError }: DocumentViewProps) {
  return (
    <article className="document">
      {document.blocks.map((block) => (
        <BlockView
          key={block.path.join(",")}
          block={block}
          onTextDraft={onTextDraft}
          onParagraphDraft={onParagraphDraft}
          onParagraphError={onParagraphError}
        />
      ))}
    </article>
  );
}

function BlockView({
  block,
  onTextDraft,
  onParagraphDraft,
  onParagraphError,
}: {
  block: EditableBlock;
  onTextDraft: DocumentViewProps["onTextDraft"];
  onParagraphDraft: DocumentViewProps["onParagraphDraft"];
  onParagraphError: DocumentViewProps["onParagraphError"];
}) {
  if (block.block === "heading") {
    const Tag = block.level <= 1 ? "h1" : block.level === 2 ? "h2" : "h3";
    return <Tag className="heading">{block.text}</Tag>;
  }
  if (block.block === "paragraph") {
    if (block.editable) {
      return (
        <ParagraphEditor
          content={block.content}
          onChange={(content) => onParagraphDraft(block.path, content)}
          onError={(cause) => onParagraphError(block.path, cause)}
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
      <div className="equation">
        <pre className="equation-math">{block.latex}</pre>
        {block.label ? <p className="equation-label">{block.label}</p> : null}
      </div>
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
