import type { RefObject } from "react";
import { useTranslation } from "react-i18next";
import { i18n, type MessageKey } from "../i18n.ts";
import { COMMAND_CENTER_SHORTCUT, EDITOR_SHORTCUTS as keys, INTERACTION_SHORTCUTS as ui, isMac, LINK_SHORTCUT, SAVE_SHORTCUT } from "../shortcuts.ts";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";

type Entry = { label: MessageKey; shortcuts: readonly { readonly label: string; binding: string }[]; macOnly?: boolean };
const groups: { label: MessageKey; entries: Entry[] }[] = [
  { label: "General", entries: [
    { label: "Command center", shortcuts: [COMMAND_CENTER_SHORTCUT] },
    { label: "Save", shortcuts: [SAVE_SHORTCUT] },
    { label: "Insert menu at a supported caret", shortcuts: [ui.slash] },
    { label: "Copy / cut a supported selection", shortcuts: [keys.copy, keys.cut] },
    { label: "Paste / paste plain text", shortcuts: [ui.paste, ui.pastePlain] },
  ] },
  { label: "Editing", entries: [
    { label: "Undo", shortcuts: [keys.undo] },
    { label: "Redo", shortcuts: [keys.redo, keys.redoAlternative] },
    { label: "Undo / redo (Russian keyboard layout)", shortcuts: [keys.undoRussian, keys.redoRussian] },
    { label: "Select all", shortcuts: [keys.selectAll] },
    { label: "Start a new block", shortcuts: [keys.newBlock] },
    { label: "Line break inside a block (paragraph, quote, endnote or admonition)", shortcuts: [keys.lineBreak, keys.lineBreakAlternative] },
    { label: "Increase / decrease heading level", shortcuts: [keys.tab, keys.shiftTab] },
    { label: "Indent / outdent a list item", shortcuts: [keys.tab, keys.shiftTab] },
    { label: "Toggle bullet list", shortcuts: [keys.bulletList] },
    { label: "Toggle numbered list", shortcuts: [keys.orderedList] },
    { label: "Delete backward / undo a just-applied input rule", shortcuts: [keys.backspace, keys.shiftBackspace] },
    { label: "Delete forward", shortcuts: [keys.delete] },
    { label: "Join / delete backward or forward at a block or list boundary", shortcuts: [keys.joinBackward, keys.joinForward] },
    { label: "Move to the document end", shortcuts: [keys.documentEnd] },
    { label: "Move below a final closed block", shortcuts: [keys.down] },
    { label: "Move to the document end (macOS)", shortcuts: [keys.documentEndMac], macOnly: true },
    { label: "Delete backward (macOS)", shortcuts: [keys.macBackspace, keys.macAltBackspace], macOnly: true },
    { label: "Delete forward (macOS)", shortcuts: [keys.macDelete, keys.macCtrlAltBackspace, keys.macAltDelete, keys.macAltD], macOnly: true },
    { label: "Move to the text block start / end (macOS)", shortcuts: [keys.macLineStart, keys.macLineEnd], macOnly: true },
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
  { label: "Code blocks", entries: [
    { label: "Toggle code block", shortcuts: [keys.codeBlock] },
    { label: "Indent / outdent code", shortcuts: [keys.tab, keys.shiftTab] },
    { label: "New code line (three Enters at the end leave the block)", shortcuts: [keys.newBlock] },
    { label: "Leave code at document start / code end", shortcuts: [keys.up, keys.down] },
  ] },
  { label: "Tables", entries: [
    { label: "Next / previous cell (Tab at the last cell adds a row)", shortcuts: [keys.tab, keys.shiftTab] },
    { label: "Leave the table for a new block", shortcuts: [keys.newBlock] },
  ] },
  { label: "Navigation and dialogs", entries: [
    { label: "Menus and folder suggestions: previous / next item", shortcuts: [keys.up, keys.down] },
    { label: "Run a menu item / close a menu or dialog", shortcuts: [keys.newBlock, ui.escape] },
    { label: "Selection toolbar: enter / return to the editor", shortcuts: [keys.tab, keys.shiftTab, ui.escape] },
    { label: "Files and Outline: previous / next / first / last item", shortcuts: [keys.up, keys.down, ui.home, ui.end] },
    { label: "Files: collapse / expand a folder", shortcuts: [ui.left, ui.right] },
    { label: "Open the focused file or heading", shortcuts: [keys.newBlock, ui.space] },
    { label: "Document tabs: previous / next / first / last tab", shortcuts: [ui.left, ui.right, ui.home, ui.end] },
    { label: "Close the focused document tab", shortcuts: [keys.delete] },
    { label: "Folder path: complete at the end of the input", shortcuts: [keys.tab, ui.right] },
    { label: "Folder path: open / go to parent after a separator", shortcuts: [keys.newBlock, keys.backspace] },
    { label: "Submit a single-line form / cancel; in Citation, Enter first adds the typed key", shortcuts: [keys.newBlock, ui.escape] },
  ] },
];

export function keyboardShortcutGroups(mac = isMac()) {
  return groups.map(group => ({ ...group, entries: group.entries.filter(entry => !entry.macOnly || mac) }));
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
            <dd className="grid justify-items-end gap-1 text-muted-foreground">
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
      <DialogContent finalFocus={() => returnFocus.current ?? true}>
        <DialogHeader>
          <DialogTitle>{i18n.t("Keyboard shortcuts")}</DialogTitle>
          <DialogDescription>{i18n.t("Existing shortcuts. Editing and formatting apply in the Visual editor where supported.")}</DialogDescription>
        </DialogHeader>
        <KeyboardShortcutGroups />
      </DialogContent>
    </Dialog>
  );
}
