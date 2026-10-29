import { useEffect, useState } from "react";
import { Bell, X } from "lucide-react";
import { Button } from "./button.tsx";
import { i18n } from "../../i18n.ts";

export type Notification = { id: string; message: string; severity: "warning" | "error"; reveal(): void };
/** P07: one window-level center; a new cause expands without moving focus. */
export function NotificationCenter({ items }: { items: Notification[] }) {
  const [hidden, setHidden] = useState<string[]>([]);
  const [expanded, setExpanded] = useState(true);
  const causes = items.map(item => item.id).join("\n");
  useEffect(() => {
    setHidden(previous => previous.filter(id => items.some(item => item.id === id)));
    setExpanded(true);
  }, [causes]);
  const visible = items.filter(item => !hidden.includes(item.id));
  if (!visible.length) return null;
  return <aside className="notification-center" data-severity={visible.some(item => item.severity === "error") ? "error" : "warning"} aria-label={i18n.t("Notifications")}>
    {expanded ? <ul aria-live="polite">{visible.map(item => <li key={item.id}>
      <p>{item.message}</p>
      <Button size="sm" variant="ghost" onClick={item.reveal}>{i18n.t("Go to problem")}</Button>
      <Button size="icon-sm" variant="ghost" aria-label={i18n.t("Dismiss notification")} onClick={() => setHidden(previous => [...previous, item.id])}><X /></Button>
    </li>)}</ul> : null}
    <Button size="sm" variant="outline" aria-label={i18n.t("Notifications")} aria-expanded={expanded} onClick={() => setExpanded(value => !value)}><Bell /> {visible.length}</Button>
  </aside>;
}
