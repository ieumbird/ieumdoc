import { useEffect } from "react";
import { Button } from "@/components/ui/button.tsx";
import { Notice } from "../ui/primitives.tsx";

export const NOTICE_TIMEOUT_MS = 5000;

/** The Desktop app's update notification: an action, and Later for this version. */
export type UpdateNotice = { text: string; action: string; onAction(): void; onLater(): void };

type MessageAreaProps = {
  error: string;
  notice: string;
  /** Standing condition of the open document (e.g. it cannot be saved); not dismissible. */
  warning?: string;
  draftNotice?: string;
  update?: UpdateNotice | null;
  onDismissError(): void;
  onNoticeExpired(): void;
};

/**
 * Application messages below the top bar, outside the document column.
 * Warnings stay while their condition holds; errors stay until dismissed or resolved;
 * notices expire.
 */
export function MessageArea({ error, notice, warning = "", draftNotice = "", update = null, onDismissError, onNoticeExpired }: MessageAreaProps) {
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(onNoticeExpired, NOTICE_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [notice]);
  if (!error && !notice && !warning && !draftNotice && !update) return null;
  return (
    <div className="message-area" data-testid="message-area">
      {draftNotice ? <Notice className="message" data-testid="draft-notice"><span className="message-text">{draftNotice}</span></Notice> : null}
      {warning ? (
        <Notice tone="warning" className="message" data-testid="writeability-warning">
          <span className="message-text">{warning}</span>
        </Notice>
      ) : null}
      {error ? (
        <Notice tone="error" className="message" data-testid="error">
          <span className="message-text">{error}</span>
          <Button variant="ghost" size="icon-sm" className="message-dismiss" aria-label="Dismiss error" onClick={onDismissError}>×</Button>
        </Notice>
      ) : null}
      {update ? (
        <Notice className="message" data-testid="update-notice">
          <span className="message-text">{update.text}</span>
          <span className="message-actions">
            <Button variant="ghost" size="sm" onClick={update.onAction}>{update.action}</Button>
            <Button variant="ghost" size="sm" onClick={update.onLater}>Later</Button>
          </span>
        </Notice>
      ) : null}
      {notice ? (
        <Notice className="message" data-testid="notice">
          <span className="message-text">{notice}</span>
        </Notice>
      ) : null}
    </div>
  );
}
