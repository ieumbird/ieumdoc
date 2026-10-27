import { useRef, type ReactElement, type ReactNode } from "react";
import { ContextMenu as Primitive } from "@base-ui/react/context-menu";
import { MENU_ITEM_CLASS, MENU_POPUP_CLASS } from "./dropdown-menu.tsx";
import { cn } from "@/lib/utils";

export type ContextMenuAction = {
  id: string;
  label: string;
  icon: ReactNode;
  visible?: boolean;
  disabled?: boolean;
  danger?: boolean;
  run(): void;
};

/** A target owns its action data; the shared primitive owns rendering and interactions. */
export function ContextMenu({ trigger, actions, disabled = false }: {
  trigger: ReactElement;
  actions: ContextMenuAction[];
  disabled?: boolean;
}) {
  const handingOff = useRef(false);
  return <Primitive.Root disabled={disabled} onOpenChange={open => { if (open) handingOff.current = false; }}>
    <Primitive.Trigger render={trigger} onKeyDown={event => {
      if (disabled || !(event.key === "ContextMenu" || event.key === "F10" && event.shiftKey)) return;
      event.preventDefault(); event.stopPropagation();
      const rect = event.currentTarget.getBoundingClientRect();
      // Base UI's trigger owns the anchor, focus and opening path for every entry method.
      event.currentTarget.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: rect.left + 12, clientY: rect.bottom }));
    }} />
    <Primitive.Portal className="ui-portal">
      <Primitive.Backdrop className="fixed inset-0 z-50" />
      <Primitive.Positioner className="isolate z-50 outline-none" sideOffset={4}>
        <Primitive.Popup data-slot="context-menu-content" className={MENU_POPUP_CLASS}
          finalFocus={() => handingOff.current ? false : true}>
          {actions.filter(action => action.visible !== false).map(action => <Primitive.Item key={action.id}
            className={cn(MENU_ITEM_CLASS, action.danger && "text-destructive data-highlighted:text-destructive data-highlighted:bg-[var(--id-color-surface-danger)]")}
            data-danger={action.danger || undefined} disabled={action.disabled}
            onClick={() => { handingOff.current = true; action.run(); }}>
            {action.icon}{action.label}
          </Primitive.Item>)}
        </Primitive.Popup>
      </Primitive.Positioner>
    </Primitive.Portal>
  </Primitive.Root>;
}
