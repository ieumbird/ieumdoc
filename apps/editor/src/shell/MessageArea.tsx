import { useTranslation } from "react-i18next";
import { i18n } from "../i18n.ts";
import { UiError, type UiMessage } from "../ui-message.ts";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { SaveDisplayError, SaveErrorLocation } from "../save-error.ts";
import { Button } from "@/components/ui/button.tsx";
import { Notice } from "../ui/primitives.tsx";
import { useNotifications, type Notification } from "../components/ui/notification-center.tsx";

export const NOTICE_TIMEOUT_MS = 5000;
type MessageAreaProps = {
  error: string;
  errorCause?: UiMessage;
  noticeCause?: UiMessage;
  saveError?: { failure: SaveDisplayError; locations: readonly SaveErrorLocation[]; onReveal(index: number): void };
  notice: string;
  noticeAction?: (() => void) | null;
  warnings?: readonly { id: string; message: string }[];
  draftNotice?: string;
  reserveDraftNotice?: boolean;
  documentNotice?: string;
  onReveal?(): void;
  onNoticeExpired(): void;
};

/** Existing message producers register with the window center; notices keep their five-second lifetime. */
export function MessageArea({ error, errorCause = error, noticeCause, saveError, notice, noticeAction = null, warnings = [], draftNotice = "", reserveDraftNotice = false, documentNotice = "", onReveal, onNoticeExpired }: MessageAreaProps) {
  useTranslation();
  const expire = useRef(onNoticeExpired);
  expire.current = onNoticeExpired;
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => expire.current(), NOTICE_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [notice, noticeAction]);
  const items: Notification[] = [];
  if (error) items.push({ id: `error:${saveError?.failure.details ?? causeId(errorCause)}`, message: error, severity: "error", testId: "error",
    dismissLabel: i18n.t("Dismiss error"),
    revision: JSON.stringify(saveError?.locations),
    ...(saveError ? { render: () => <SaveErrorContent {...saveError} /> } : { reveal: onReveal }),
  });
  for (const [testId, message, severity] of [
    ["document-notice", documentNotice, "info"], ["notice", notice, "info"],
  ] as const) if (message) items.push({ id: testId === "notice" ? `notice:${causeId(noticeCause ?? notice)}` : testId, message, severity, testId, reveal: onReveal,
    ...(testId === "notice" && noticeAction ? { render: () => <><p>{message}</p><Button variant="ghost" size="sm" onClick={noticeAction}>{i18n.t("Undo")}</Button></> } : {}),
  });
  for (const warning of warnings) items.push({ ...warning, severity: "warning", testId: "writeability-warning", reveal: onReveal });
  useNotifications(items);
  // The translated copy measures its own wrapping even while hidden. Reserving it keeps
  // both Visual and Source stationary without covering document controls or first lines.
  return draftNotice || reserveDraftNotice ? <div className="message-area" data-testid="message-area" data-reserved={!draftNotice || undefined} aria-hidden={!draftNotice || undefined}>
    <Notice className="message" data-testid={draftNotice ? "draft-notice" : undefined}><span className="message-text">{draftNotice || i18n.t("Save and Source include applied content only. Unapplied edit drafts stay unsaved until you apply them.")}</span></Notice>
  </div> : null;
}

// Translation changes presentation, never the identity of an unresolved cause.
function causeId(message: UiMessage): string {
  if (message instanceof UiError) return JSON.stringify(message.detail);
  return message instanceof Error ? message.message : JSON.stringify(message);
}

export function SaveErrorContent({ failure, locations, onReveal }: NonNullable<MessageAreaProps["saveError"]>) {
  const [current, setCurrent] = useState(0);
  const details = useRef<HTMLDetailsElement>(null);
  useLayoutEffect(() => { setCurrent(0); if (details.current) details.current.open = false; }, [failure]);
  const active = Math.min(current, Math.max(0, locations.length - 1));
  const move = (index: number) => { setCurrent(index); onReveal(index); };
  return <div className="save-error-content">
    <span className="message-text">{failure.summary}</span>
    {locations.length ? <span className="message-actions">
      <Button className="notification-reveal" variant="ghost" size="sm" onClick={() => move(active)}>{i18n.t("Go to problem")}</Button>
      {locations.length > 1 ? <>
        <Button variant="ghost" size="sm" aria-label={i18n.t("Previous problem")} onClick={() => move((active + locations.length - 1) % locations.length)}>←</Button>
        <span>{active + 1} / {locations.length}</span>
        <Button variant="ghost" size="sm" aria-label={i18n.t("Next problem")} onClick={() => move((active + 1) % locations.length)}>→</Button>
      </> : null}
    </span> : failure.locations.length ? <span className="message-text">{i18n.t("The document changed. Save again to locate the problem.")}</span> : null}
    <details ref={details} className="save-error-details">
      <summary>{i18n.t("Technical details")}</summary>
      <p>{failure.details}</p>
    </details>
  </div>;
}
