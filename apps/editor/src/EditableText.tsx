import { useRef } from "react";

type EditableTextProps = {
  tag: "p" | "figcaption" | "span";
  className: string;
  text: string;
  onChange: (text: string) => void;
};

export function EditableText({ tag: Tag, className, text, onChange }: EditableTextProps) {
  const last = useRef(text);

  return (
    <Tag
      className={`${className} editable`}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      onInput={(event) => {
        const next = readText(event.currentTarget);
        last.current = next;
        onChange(next);
      }}
      onBlur={(event) => {
        const next = readText(event.currentTarget);
        if (next !== last.current) {
          last.current = next;
          onChange(next);
        }
      }}
    >
      {text}
    </Tag>
  );
}

function readText(node: HTMLElement): string {
  return (node.innerText ?? node.textContent ?? "").replace(/\u00a0/g, " ").replace(/\n+/g, " ").trimEnd();
}
