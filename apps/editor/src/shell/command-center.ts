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
  /** A listed Markdown file without Litzio's native marker, as in the sidebar. */
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
  const matches = items.filter(item => {
    if (commandsOnly && item.kind !== "command") return false;
    const text = normalize([item.label, item.detail, ...(item.keywords ?? [])].join(" "));
    return words.every(word => text.includes(word));
  });
  // Stable sort preserves tab/tree/command order inside each match grade.
  const labelMatches = (item: CommandCenterItem) => words.every(word => normalize(item.label).includes(word));
  return matches.sort((a, b) => Number(labelMatches(b)) - Number(labelMatches(a)));
}
