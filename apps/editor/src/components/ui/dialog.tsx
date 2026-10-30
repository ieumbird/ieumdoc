import { useTranslation } from "react-i18next";
import { i18n } from "../../i18n.ts";
import * as React from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { cn } from "@/lib/utils"

import { Button } from "@/components/ui/button"
import { XIcon } from "lucide-react"

const ModalContext = React.createContext(true)

function Dialog({ ...props }: DialogPrimitive.Root.Props) {
  return <ModalContext.Provider value={props.modal !== false}>
    <DialogPrimitive.Root data-slot="dialog" {...props} />
  </ModalContext.Provider>
}

function DialogPortal({ className, ...props }: DialogPrimitive.Portal.Props) {
  const modal = React.useContext(ModalContext)
  const [portal, setPortal] = React.useState<HTMLDivElement | null>(null)
  React.useLayoutEffect(() => {
    if (!modal || !portal) return
    const document = portal.ownerDocument
    // Chromium shares native input history across the document. beforeinput names
    // the real history target before the default action edits it and transfers focus.
    // Include descendant portals (menus/nested dialogs); the inner modal guards its own boundary.
    const guardHistory = (event: InputEvent) => {
      if ((event.inputType === "historyUndo" || event.inputType === "historyRedo") &&
          portal.contains(document.activeElement) && event.target instanceof Node && !portal.contains(event.target)) {
        event.preventDefault()
      }
    }
    document.addEventListener("beforeinput", guardHistory, true)
    return () => document.removeEventListener("beforeinput", guardHistory, true)
  }, [modal, portal])
  return <DialogPrimitive.Portal data-slot="dialog-portal" className={cn("ui-portal", className)} {...props} ref={setPortal} />
}

function DialogOverlay({
  className,
  ...props
}: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 isolate z-50 bg-[var(--id-color-backdrop)] supports-backdrop-filter:backdrop-blur-xs",
        className
      )}
      {...props}
    />
  )
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: DialogPrimitive.Popup.Props & {
  showCloseButton?: boolean
}) {
  useTranslation();
  return (
    <DialogPortal>
      {/* Nested dialogs need their own backdrop above the parent popup for outside dismissal. */}
      <DialogOverlay forceRender />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        className={cn(
          "fixed top-1/2 left-1/2 z-50 grid max-h-[calc(100dvh-2rem)] overflow-y-auto w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl bg-popover p-4 text-sm text-popover-foreground border border-border shadow-[var(--shadow-overlay)] outline-none sm:max-w-sm",
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            render={
              <Button
                variant="ghost"
                className="absolute top-2 right-2"
                size="icon-sm"
              />
            }
          >
            <XIcon
            />
            <span className="sr-only">{i18n.t("Close")}</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Popup>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
}) {
  useTranslation();
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "-mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-xl border-t bg-muted/50 p-4 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close render={<Button variant="outline" />}>{i18n.t("Close")}</DialogPrimitive.Close>
      )}
    </div>
  )
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn(
        "font-heading text-base leading-none font-semibold",
        className
      )}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        "text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        className
      )}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
}
