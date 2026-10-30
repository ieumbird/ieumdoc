import { createContext, useCallback, useContext, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Bell, X } from "lucide-react";
import { Button } from "./button.tsx";
import { i18n } from "../../i18n.ts";

export type Notification = {
  id: string; message: string; severity: "info" | "warning" | "error";
  reveal?(): void;
  render?(): ReactNode;
  /** Changes to details/navigation, without treating them as a new cause. */
  revision?: string;
  testId?: string;
  context?: string;
  dismissLabel?: string;
};
type Register = (source: string, items?: Notification[]) => void;
const Registry = createContext<Register>(() => {});
export const NotificationScope = createContext<{ name: string; reveal(action: () => void): void } | null>(null);

/** In-memory UI state owned by this App instance; never part of document/recovery state. */
export function NotificationProvider({ children }: { children: ReactNode }) {
  const [sources, setSources] = useState<Record<string, Notification[]>>({});
  const register = useCallback<Register>((source, items) => setSources(previous => {
    const next = { ...previous };
    if (items?.length) next[source] = items;
    else delete next[source];
    return next;
  }), []);
  return <Registry value={register}>{children}<NotificationCenter items={Object.values(sources).flat()} /></Registry>;
}

/** Callbacks read the latest source render, while registry updates follow observable content. */
export function useNotifications(items: Notification[]) {
  const register = useContext(Registry);
  const scope = useContext(NotificationScope);
  const source = useId();
  const latest = useRef({ items, scope });
  latest.current = { items, scope };
  const signature = JSON.stringify([scope?.name, items.map(({ id, message, severity, revision, testId, dismissLabel, reveal }) =>
    [id, message, severity, revision, testId, dismissLabel, !!reveal])]);
  useLayoutEffect(() => {
    register(source, items.map((item, index) => ({ ...item, id: `${source}:${item.id}`,
      context: scope?.name,
      render: item.render ? () => latest.current.items[index]?.render?.() : undefined,
      reveal: item.reveal ? () => {
        const current = latest.current;
        const action = () => current.items[index]?.reveal?.();
        if (current.scope) current.scope.reveal(action); else action();
      } : undefined,
    })));
  }, [register, source, signature]);
  useLayoutEffect(() => () => register(source), [register, source]);
}

export function NotificationSource({ items }: { items: Notification[] }) { useNotifications(items); return null; }

/** A new warning/error expands without moving focus. Removal and information do not reopen it. */
export function NotificationCenter({ items }: { items: Notification[] }) {
  useTranslation();
  const [hidden, setHidden] = useState<string[]>([]);
  const [expanded, setExpanded] = useState(() => items.some(item => item.severity !== "info"));
  const [announcement, setAnnouncement] = useState<{ sequence: number; text: string }>();
  const previous = useRef<string[]>([]);
  const visible = items.filter(item => !hidden.includes(item.id));
  const severity = visible.some(item => item.severity === "error") ? "error" : visible.some(item => item.severity === "warning") ? "warning" : "info";
  const label = i18n.t(severity === "error" ? "Error" : severity === "warning" ? "Warning" : "Information");
  const accessibleLabel = visible.length ? i18n.t("Notifications: {{severity}}, {{count}}", { severity: label, count: visible.length }) : i18n.t("Notifications: none");
  const causes = JSON.stringify(items.map(item => [item.id, item.severity]));
  useLayoutEffect(() => {
    const ids = items.map(item => item.id);
    setHidden(value => value.filter(id => ids.includes(id)));
    if (items.some(item => item.severity !== "info" && !previous.current.includes(item.id))) setExpanded(true);
    if (visible.some(item => !previous.current.includes(item.id))) {
      setAnnouncement(value => ({ sequence: (value?.sequence ?? 0) + 1, text: accessibleLabel }));
    }
    previous.current = ids;
  }, [causes]);
  return <>
    <div className="sr-only" aria-live="polite" aria-atomic="true" data-testid="notification-announcement">
      {announcement ? <span key={announcement.sequence}>{announcement.text}</span> : null}
    </div>
    <aside className="notification-center" data-severity={visible.length ? severity : undefined} aria-label={i18n.t("Notifications")}>
    <ul hidden={!expanded} id="notification-list" aria-label={i18n.t("Notifications")}>{visible.map(item => <li key={item.id} data-severity={item.severity}>
      <div className="notification-content">
        {item.context ? <p className="notification-context">{item.context}</p> : null}
        <div data-testid={item.testId} role={item.severity === "error" ? "alert" : "status"}>
        {item.render ? item.render() : <p>{item.message}</p>}
        {item.reveal ? <Button className="notification-reveal" size="sm" variant="ghost" onClick={item.reveal}>{i18n.t("Go to problem")}</Button> : null}
        </div>
      </div>
      <Button size="icon-sm" variant="ghost" aria-label={item.dismissLabel ?? i18n.t("Dismiss notification")}
        onClick={() => setHidden(value => [...value, item.id])}><X /></Button>
    </li>)}{visible.length ? null : <li>{i18n.t("No notifications")}</li>}</ul>
    <Button size="sm" variant="outline" aria-label={accessibleLabel} aria-expanded={expanded} aria-controls={expanded ? "notification-list" : undefined}
      onClick={() => setExpanded(value => !value)}><Bell />{visible.length ? <span>{label} · {visible.length}</span> : null}</Button>
  </aside></>;
}
