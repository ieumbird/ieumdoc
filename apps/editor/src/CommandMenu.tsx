import type { LucideIcon } from "lucide-react";
import { Fragment, useEffect, useRef, type CSSProperties } from "react";
import { useOverlayBounds } from "./ui/use-overlay-bounds.ts";

export type CommandMenuItem = {
  id: string;
  label: string;
  disabled?: boolean;
  /** Consecutive items of one group are divided from the previous group by a separator. */
  group?: string;
  /** A short secondary text, such as the Markdown shortcut for the same block. */
  hint?: string;
  icon?: LucideIcon;
};

type CommandMenuProps = {
  label: string;
  items: CommandMenuItem[];
  style: CSSProperties;
  /** Controlled highlight while focus stays in the editor (slash command). */
  activeIndex?: number;
  /** Move focus into the menu when opened from a button. */
  focusOnOpen?: boolean;
  emptyText?: string;
  onSelect(id: string): void;
  onClose(): void;
};

/** Presentational menu shared by the insert menu (`+` and `/`) and the block menu. */
export function CommandMenu({ label, items, style, activeIndex, focusOnOpen, emptyText, onSelect, onClose }: CommandMenuProps) {
  const root = useOverlayBounds<HTMLDivElement>();
  const returnFocus = useRef<Element | null>(null);
  useEffect(() => {
    // StrictMode repeats effects; never replace the opener with our own first item.
    if (!root.current?.contains(document.activeElement)) returnFocus.current = document.activeElement;
    if (focusOnOpen) root.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    const outside = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) onClose();
    };
    document.addEventListener("mousedown", outside);
    return () => document.removeEventListener("mousedown", outside);
  }, []);
  return (
    <div
      ref={root}
      className="command-menu"
      role="menu"
      aria-label={label}
      style={style}
      onMouseDown={event => event.stopPropagation()}
      onKeyDown={event => {
        if (event.key === "Escape") {
          event.preventDefault();
          onClose();
          if (focusOnOpen && returnFocus.current instanceof HTMLElement && returnFocus.current.isConnected) returnFocus.current.focus();
          return;
        }
        if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
        event.preventDefault();
        const buttons = [...root.current!.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
        const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next = (current + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
        buttons[next]?.focus();
      }}
    >
      {items.length === 0 ? <p className="command-menu-empty">{emptyText ?? "No matches"}</p> : null}
      {items.map((item, index) => {
        const Icon = item.icon;
        return (
          <Fragment key={item.id}>
            {index > 0 && item.group !== items[index - 1].group
              ? <div className="command-menu-separator" role="separator" aria-label={item.group} />
              : null}
            <button
              type="button"
              role="menuitem"
              // The hint is secondary text; the item is named by its label alone.
              aria-label={item.label}
              className={`command-menu-item${index === activeIndex ? " active" : ""}`}
              disabled={item.disabled}
              // Keep the editor selection for slash commands.
              onMouseDown={event => event.preventDefault()}
              onClick={() => onSelect(item.id)}
            >
              {Icon ? <Icon className="command-menu-icon" aria-hidden="true" size={16} /> : null}
              <span className="command-menu-label">{item.label}</span>
              {item.hint ? <kbd className="command-menu-hint">{item.hint}</kbd> : null}
            </button>
          </Fragment>
        );
      })}
    </div>
  );
}
