import { useEffect, useRef } from "react";
import { focusTextField, type FocusEdge } from "./editor-focus.ts";

type HeadingEditorProps = {
  level: number;
  text: string;
  testId: string;
  autoFocus: FocusEdge | null;
  onChange: (text: string) => void;
  onBackspaceAtStart: (text: string) => void;
  onVerticalExit: (direction: "up" | "down") => boolean;
  onRegisterFocus: (focus: (edge: FocusEdge) => void) => () => void;
  onAutoFocusApplied: () => void;
};

export function HeadingEditor({
  level,
  text,
  testId,
  autoFocus,
  onChange,
  onBackspaceAtStart,
  onVerticalExit,
  onRegisterFocus,
  onAutoFocusApplied,
}: HeadingEditorProps) {
  const inputRef = useRef<HTMLInputElement>(null);

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
    <div className={`heading heading-editor level-${level <= 1 ? 1 : level === 2 ? 2 : 3}`}>
      <input
        ref={inputRef}
        className="heading-input"
        aria-label="Heading"
        data-testid={testId}
        defaultValue={text}
        spellCheck={false}
        onInput={(event) => onChange(event.currentTarget.value)}
        onKeyDown={(event) => {
          const element = event.currentTarget;
          if (isModified(event.nativeEvent)) return;
          if (event.key === "ArrowUp") {
            event.preventDefault();
            onVerticalExit("up");
            return;
          }
          if (event.key === "ArrowDown") {
            event.preventDefault();
            onVerticalExit("down");
            return;
          }
          if (event.key === "Backspace" && element.selectionStart === 0 && element.selectionEnd === 0) {
            event.preventDefault();
            onBackspaceAtStart(element.value);
          }
        }}
      />
    </div>
  );
}

function isModified(event: KeyboardEvent): boolean {
  return event.shiftKey || event.altKey || event.ctrlKey || event.metaKey || event.isComposing;
}
