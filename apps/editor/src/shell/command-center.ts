import type { LucideIcon } from "lucide-react";

/** A view of existing shell actions, rebuilt from the current tab and operation state. */
export type CommandCenterItem = {
  id: string;
  kind: "document" | "file" | "command";
  label: string;
  keywords?: string[];
  detail?: string;
  shortcut?: string;
  icon: LucideIcon;
  disabled?: boolean;
  /** A listed Markdown file without IeumDoc's native marker, as in the sidebar. */
  foreign?: boolean;
  /** A command opening another surface owns its focus after the center has closed. */
  takesFocus?: boolean;
  run(): void;
};

export function filterCommandCenterItems(items: readonly CommandCenterItem[], query: string): CommandCenterItem[] {
  const trimmed = query.trim();
  const commandsOnly = trimmed.startsWith(">");
  const normalize = (value: string) => value.normalize("NFKC").toLocaleLowerCase();
  const words = normalize(commandsOnly ? trimmed.slice(1) : trimmed).split(/\s+/).filter(Boolean);
  return items.filter(item => {
    if (commandsOnly && item.kind !== "command") return false;
    const text = normalize([item.label, item.detail, ...(item.keywords ?? [])].join(" "));
    return words.every(word => text.includes(word));
  });
}
