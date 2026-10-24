import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Combobox } from "@base-ui/react/combobox";
import { Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { i18n } from "../i18n.ts";
import { Input } from "@/components/ui/input.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog.tsx";
import { filterCommandCenterItems, type CommandCenterItem } from "./command-center.ts";

type Props = {
  open: boolean;
  initialQuery: string;
  items: CommandCenterItem[];
  returnFocus: RefObject<HTMLElement | null>;
  onClose(): void;
};

// Bound DOM work without dropping matches; every result remains searchable and paged.
const RESULTS_PER_PAGE = 50;

export function CommandCenter({ open, initialQuery, items, returnFocus, onClose }: Props) {
  useTranslation();
  const [query, setQuery] = useState(initialQuery);
  const [resultPage, setResultPage] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const selected = useRef<CommandCenterItem | null>(null);
  const transfersFocus = useRef(false);
  useEffect(() => {
    if (open) { setQuery(initialQuery); setResultPage(0); transfersFocus.current = false; }
  }, [open, initialQuery]);
  const filtered = useMemo(() => open ? filterCommandCenterItems(items, query) : [], [items, query, open]);
  const lastPage = Math.max(0, Math.ceil(filtered.length / RESULTS_PER_PAGE) - 1);
  const page = Math.min(resultPage, lastPage);
  const first = page * RESULTS_PER_PAGE;
  const visible = useMemo(() => filtered.slice(first, first + RESULTS_PER_PAGE), [filtered, first]);
  const changePage = (next: number) => {
    setResultPage(next);
    input.current?.focus();
  };
  const close = (next: boolean) => { if (!next) onClose(); };
  return (
    <Combobox.Root<CommandCenterItem> inline open={open} onOpenChange={close} autoHighlight
      items={visible} filteredItems={visible} value={null} inputValue={query}
      onInputValueChange={next => { setQuery(next); setResultPage(0); }} itemToStringLabel={item => item.label}
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
          {lastPage > 0 ? <div className="command-center-footer">
            <span role="status">{i18n.t("Showing {{first}}–{{last}} of {{total}} results. Narrow your search or change page.", {
              first: first + 1, last: first + visible.length, total: filtered.length,
            })}</span>
            <div className="command-center-page-controls">
              <Button variant="ghost" size="sm" disabled={page === 0} onClick={() => changePage(page - 1)}>{i18n.t("Previous results")}</Button>
              <Button variant="ghost" size="sm" disabled={page === lastPage} onClick={() => changePage(page + 1)}>{i18n.t("Next results")}</Button>
            </div>
          </div> : null}
          <div className="command-center-footer">
            <span>{i18n.t("Type > for commands")}</span>
            <span><kbd>↑↓</kbd> {i18n.t("Navigate")} <kbd>Enter</kbd> {i18n.t("Run")}</span>
          </div>
        </DialogContent>
      </Dialog>
    </Combobox.Root>
  );
}
