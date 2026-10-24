import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Combobox } from "@base-ui/react/combobox";
import { Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { i18n } from "../i18n.ts";
import { Input } from "@/components/ui/input.tsx";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog.tsx";
import { filterCommandCenterItems, type CommandCenterItem } from "./command-center.ts";

type Props = {
  open: boolean;
  initialQuery: string;
  items: CommandCenterItem[];
  returnFocus: RefObject<HTMLElement | null>;
  onClose(): void;
};

// Search all candidates, then bound DOM work. Further matches require a narrower query.
const MAX_VISIBLE_RESULTS = 50;

export function CommandCenter({ open, initialQuery, items, returnFocus, onClose }: Props) {
  useTranslation();
  const [query, setQuery] = useState(initialQuery);
  const input = useRef<HTMLInputElement>(null);
  const selected = useRef<CommandCenterItem | null>(null);
  const transfersFocus = useRef(false);
  useEffect(() => {
    if (open) { setQuery(initialQuery); transfersFocus.current = false; }
  }, [open, initialQuery]);
  const filtered = useMemo(() => open ? filterCommandCenterItems(items, query) : [], [items, query, open]);
  const visible = useMemo(() => filtered.slice(0, MAX_VISIBLE_RESULTS), [filtered]);
  const close = (next: boolean) => { if (!next) onClose(); };
  return (
    <Combobox.Root<CommandCenterItem> inline open={open} onOpenChange={close} autoHighlight
      items={visible} filteredItems={visible} value={null} inputValue={query}
      onInputValueChange={setQuery} itemToStringLabel={item => item.label}
      isItemEqualToValue={(a, b) => a.id === b.id}
      onValueChange={item => {
        if (!item || item.disabled) return;
        selected.current = item;
        transfersFocus.current = Boolean(item.takesFocus);
        // Activate the retained tab in the same commit as dismissal; Dialog owns final focus.
        if (item.kind === "document") item.run();
        onClose();
      }}>
      <Dialog open={open} onOpenChange={close} onOpenChangeComplete={next => {
        if (next) return;
        const item = selected.current;
        selected.current = null;
        // Release focus/inertness before commands or file admission open another dialog.
        if (item && item.kind !== "document") item.run();
      }}>
        <DialogContent className="command-center-dialog" showCloseButton={false} initialFocus={input}
          finalFocus={() => transfersFocus.current ? false : returnFocus.current ?? true}>
          <DialogTitle className="sr-only">{i18n.t("Command center")}</DialogTitle>
          <DialogDescription className="sr-only">{i18n.t("Search opened tabs, listed documents and existing commands. Type > for commands only.")}</DialogDescription>
          <div className="command-center-search">
            <Search aria-hidden="true" size={16} />
            <Combobox.Input ref={input} autoFocus aria-label={i18n.t("Search documents and commands")}
              placeholder={i18n.t("Search documents and commands")}
              render={<Input />} />
            <kbd aria-hidden="true">Esc</kbd>
          </div>
          <Combobox.Empty className="command-center-empty">{i18n.t("No matches")}</Combobox.Empty>
          <Combobox.List className="command-center-results">
            {(item: CommandCenterItem, index: number) => (
              <Combobox.Item key={item.id} value={item} index={index} disabled={item.disabled}
                className="command-center-result" aria-label={item.label} data-foreign={item.foreign || undefined}
                aria-description={item.foreign ? i18n.t("Not an IeumDoc document") : undefined}>
                <item.icon aria-hidden="true" size={16} />
                <span className="command-center-result-copy">
                  <span className="command-center-result-label">{item.label}</span>
                  {item.detail ? <span className="command-center-result-detail" title={item.detail}>{item.detail}</span> : null}
                </span>
                {item.shortcut ? <kbd>{item.shortcut}</kbd> : null}
              </Combobox.Item>
            )}
          </Combobox.List>
          <Combobox.Status className="command-center-footer" data-testid="command-center-count">
            {filtered.length > MAX_VISIBLE_RESULTS
              ? i18n.t("Showing {{shown}} of {{total}} results. Type more to narrow your search.", { shown: visible.length, total: filtered.length })
              : i18n.t("Results: {{total}}", { total: filtered.length })}
          </Combobox.Status>
          <div className="command-center-footer">
            <span>{i18n.t("Type > for commands")}</span>
            <span><kbd>↑↓</kbd> {i18n.t("Navigate")} <kbd>Enter</kbd> {i18n.t("Run")}</span>
          </div>
        </DialogContent>
      </Dialog>
    </Combobox.Root>
  );
}
