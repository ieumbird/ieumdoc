import type { EditableBlock, EditableDocument, NodePath } from "@ieumdoc/core";
import { EditableText } from "./EditableText.tsx";

type DocumentViewProps = {
  document: EditableDocument;
  onDraft: (path: NodePath, text: string) => void;
};

export function DocumentView({ document, onDraft }: DocumentViewProps) {
  return (
    <article className="document">
      {document.blocks.map((block) => (
        <BlockView key={block.path.join(",")} block={block} onDraft={onDraft} />
      ))}
    </article>
  );
}

function BlockView({ block, onDraft }: { block: EditableBlock; onDraft: DocumentViewProps["onDraft"] }) {
  if (block.block === "heading") {
    const Tag = block.level <= 1 ? "h1" : block.level === 2 ? "h2" : "h3";
    return <Tag className="heading">{block.text}</Tag>;
  }
  if (block.block === "paragraph") {
    if (block.editable) {
      return (
        <EditableText
          className="paragraph"
          tag="p"
          text={block.text}
          onChange={(text) => onDraft(block.path, text)}
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
        <EditableText
          className="caption"
          tag="figcaption"
          text={block.caption.text}
          onChange={(text) => onDraft(block.caption.path, text)}
        />
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
                  <EditableText
                    className="cell"
                    tag="span"
                    text={cell.text}
                    onChange={(text) => onDraft(cell.path, text)}
                  />
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
                  <EditableText
                    className="cell"
                    tag="span"
                    text={cell.text}
                    onChange={(text) => onDraft(cell.path, text)}
                  />
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
