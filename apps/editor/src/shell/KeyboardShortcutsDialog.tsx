import type { RefObject } from "react";
import { useTranslation } from "react-i18next";
import { i18n, type MessageKey } from "../i18n.ts";
import { COMMAND_CENTER_SHORTCUT, EDITOR_SHORTCUTS as keys, LINK_SHORTCUT, SAVE_SHORTCUT } from "../shortcuts.ts";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";

type Entry = { label: MessageKey; shortcuts: readonly { readonly label: string; binding: string }[] };
const groups: { label: MessageKey; entries: Entry[] }[] = [
  { label: "General", entries: [
    { label: "Command center", shortcuts: [COMMAND_CENTER_SHORTCUT] },
    { label: "Save", shortcuts: [SAVE_SHORTCUT] },
  ] },
  { label: "Editing", entries: [
    { label: "Undo", shortcuts: [keys.undo] },
    { label: "Redo", shortcuts: [keys.redo, keys.redoAlternative] },
    { label: "New block", shortcuts: [keys.newBlock] },
    { label: "Edit selected figure, table or math", shortcuts: [keys.newBlock] },
    { label: "Line break", shortcuts: [keys.lineBreak] },
    { label: "Heading level / list indent", shortcuts: [keys.tab, keys.shiftTab] },
    { label: "Bullet list", shortcuts: [keys.bulletList] },
    { label: "Numbered list", shortcuts: [keys.orderedList] },
    { label: "Code block", shortcuts: [keys.codeBlock] },
    { label: "Go to document end", shortcuts: [keys.documentEnd] },
  ] },
  { label: "Formatting", entries: [
    { label: "Bold", shortcuts: [keys.bold] },
    { label: "Italic", shortcuts: [keys.italic] },
    { label: "Strikethrough", shortcuts: [keys.strike] },
    { label: "Inline code", shortcuts: [keys.code] },
    { label: "Link", shortcuts: [LINK_SHORTCUT] },
    { label: "Subscript", shortcuts: [keys.subscript] },
    { label: "Superscript", shortcuts: [keys.superscript] },
  ] },
  { label: "Tables", entries: [
    { label: "Next / previous cell", shortcuts: [keys.tab, keys.shiftTab] },
  ] },
];

export function keyboardShortcutGroups() {
  return groups;
}

/** Read-only content, shared with headless label/translation checks. */
export function KeyboardShortcutGroups() {
  useTranslation();
  return keyboardShortcutGroups().map(group => (
    <section key={group.label} className="grid gap-2" aria-label={i18n.t(group.label)}>
      <h3 className="text-sm font-semibold">{i18n.t(group.label)}</h3>
      <dl className="grid gap-2">
        {group.entries.map(entry => (
          <div key={entry.label} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4">
            <dt>{i18n.t(entry.label)}</dt>
            <dd className="flex flex-wrap justify-end gap-x-3 gap-y-1 text-muted-foreground">
              {entry.shortcuts.map(shortcut => <kbd key={shortcut.label} className="whitespace-nowrap">{shortcut.label}</kbd>)}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  ));
}

export function KeyboardShortcutsDialog({ open, returnFocus, onClose }: {
  open: boolean; returnFocus: RefObject<HTMLElement | null>; onClose(): void;
}) {
  useTranslation();
  return (
    <Dialog open={open} onOpenChange={next => { if (!next) onClose(); }}>
      <DialogContent className="sm:max-w-[var(--layout-folder-picker-width)]" finalFocus={() => returnFocus.current ?? true}>
        <DialogHeader>
          <DialogTitle>{i18n.t("Keyboard shortcuts")}</DialogTitle>
          <DialogDescription>{i18n.t("Editing shortcuts in the Visual editor where supported.")}</DialogDescription>
        </DialogHeader>
        <KeyboardShortcutGroups />
      </DialogContent>
    </Dialog>
  );
}
