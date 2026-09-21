import { useEffect, useRef, useState } from "react";
import { focusTextField, type FocusEdge } from "./editor-focus.ts";

type EquationEditorProps = {
  latex: string;
  label: string;
  testId: string;
  autoFocus: FocusEdge | null;
  onChange: (latex: string) => void;
  onBackspaceAtStart: (latex: string) => void;
  onVerticalExit: (direction: "up" | "down") => boolean;
  onRegisterFocus: (focus: (edge: FocusEdge) => void) => () => void;
  onAutoFocusApplied: () => void;
};

export function EquationEditor({
  latex,
  label,
  testId,
  autoFocus,
  onChange,
  onBackspaceAtStart,
  onVerticalExit,
  onRegisterFocus,
  onAutoFocusApplied,
}: EquationEditorProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [expression, setExpression] = useState(latex);

  useEffect(() => {
    return onRegisterFocus((edge) => {
      if (inputRef.current) focusTextField(inputRef.current, edge);
    });
  }, [onRegisterFocus]);

  useEffect(() => {
    if (!autoFocus || !inputRef.current) return;
    focusTextField(inputRef.current, autoFocus);
    onAutoFocusApplied();
  }, [autoFocus]);

  return (
    <div className="equation equation-editor" data-testid={testId}>
      <label className="equation-source-label">
        LaTeX
        <textarea
          ref={inputRef}
          className="equation-source"
          aria-label="LaTeX source"
          defaultValue={latex}
          spellCheck={false}
          rows={2}
          onInput={(event) => {
            const next = event.currentTarget.value;
            setExpression(next);
            onChange(next);
          }}
          onKeyDown={(event) => {
            const element = event.currentTarget;
            const native = event.nativeEvent;
            if (isPlainArrow(native) && native.key === "ArrowUp" && caretAt(element, "start")) {
              event.preventDefault();
              onVerticalExit("up");
              return;
            }
            if (isPlainArrow(native) && native.key === "ArrowDown" && caretAt(element, "end")) {
              event.preventDefault();
              onVerticalExit("down");
              return;
            }
            if (
              native.key === "Backspace" &&
              !native.shiftKey &&
              !native.altKey &&
              !native.ctrlKey &&
              !native.metaKey &&
              !native.isComposing &&
              element.selectionStart === 0 &&
              element.selectionEnd === 0
            ) {
              event.preventDefault();
              onBackspaceAtStart(element.value);
            }
          }}
        />
      </label>
      <p className="equation-expression-label">Expression</p>
      <pre className="equation-math" data-testid={`${testId}-expression`}>
        {expression}
      </pre>
      {label ? <p className="equation-label">{label}</p> : null}
    </div>
  );
}

function isPlainArrow(event: KeyboardEvent): boolean {
  return (
    (event.key === "ArrowUp" || event.key === "ArrowDown") &&
    !event.shiftKey &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.isComposing
  );
}

function caretAt(element: HTMLTextAreaElement, edge: "start" | "end"): boolean {
  const start = element.selectionStart ?? 0;
  const end = element.selectionEnd ?? 0;
  if (start !== end) return false;
  return edge === "start" ? start === 0 : start === element.value.length;
}
