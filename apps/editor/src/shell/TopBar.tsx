import { COMMAND_CENTER_SHORTCUT } from "../shortcuts.ts";
import { useTranslation } from "react-i18next";
import { i18n } from "../i18n.ts";
import { useLayoutEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { splitDocumentPath } from "./document-path.ts";

export type DocumentView = "read" | "visual" | "source";

type TopBarProps = {
  onOpenCommandCenter?(): void;
  documentPath: string;
  /** Secondary search context; the tab row already names the active document. */
  location?: string[];
};

/** Shared title-strip search. Document actions belong to the owning tab row. */
export function TopBar({ onOpenCommandCenter, documentPath, location = [] }: TopBarProps) {
  useTranslation();
  const { name } = splitDocumentPath(documentPath);
  const commandButton = useRef<HTMLButtonElement>(null);
  const commandName = useRef<HTMLSpanElement>(null);
  const commandShortcut = useRef<HTMLElement>(null);
  const [commandDetail, setCommandDetail] = useState<"path" | "shortcut" | "name">("path");
  useLayoutEffect(() => {
    const button = commandButton.current;
    if (!button) return;
    let active = true;
    const measure = () => {
      if (!active) return;
      const style = getComputedStyle(button);
      const gap = parseFloat(style.columnGap);
      const available = button.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      const action = commandName.current?.scrollWidth ?? 0;
      const shortcut = commandShortcut.current?.scrollWidth ?? 0;
      const icon = button.querySelector("svg")?.getBoundingClientRect().width ?? 0;
      const withShortcut = icon + action + shortcut + gap * 2;
      // The secondary location yields first, then the shortcut; the action ellipsizes last.
      setCommandDetail(available >= withShortcut + 70 ? "path" : available >= withShortcut ? "shortcut" : "name");
    };
    const observer = new ResizeObserver(measure);
    observer.observe(button);
    measure();
    void document.fonts.ready.then(measure);
    return () => { active = false; observer.disconnect(); };
  }, [documentPath, name, location.join("/"), i18n.resolvedLanguage]);
  return (
    <header className="top-bar">
      <Button ref={commandButton} type="button" variant="outline" className="command-center-trigger" data-detail={commandDetail}
        aria-label={i18n.t("Find documents and commands")} title={i18n.t("Find documents and commands ({{shortcut}})", { shortcut: COMMAND_CENTER_SHORTCUT.label })}
        aria-haspopup="dialog" aria-keyshortcuts={COMMAND_CENTER_SHORTCUT.aria} onClick={onOpenCommandCenter}
        onMouseDown={event => { if (event.button === 0) event.preventDefault(); }}>
        <Search aria-hidden="true" />
        <span ref={commandName} className="command-center-action">{i18n.t("Find documents and commands")}</span>
        <span className="document-path" title={documentPath || undefined} aria-hidden="true">
          {documentPath ? location.map((folder, index) => (
            <span className="document-path-folder" key={index}>{folder}<span className="document-path-separator" aria-hidden="true">/</span></span>
          )) : null}
          <span className={documentPath ? "document-path-name" : undefined} data-testid="current-file" title={documentPath || undefined}>
            {documentPath ? name : i18n.t("No file opened")}
          </span>
        </span>
        <kbd ref={commandShortcut} aria-hidden="true">{COMMAND_CENTER_SHORTCUT.label}</kbd>
      </Button>
    </header>
  );
}
