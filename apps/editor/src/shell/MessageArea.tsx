import { useEffect } from "react";
import { IconButton, Notice } from "../ui/primitives.tsx";

export const NOTICE_TIMEOUT_MS = 5000;

type MessageAreaProps = {
  error: string;
  notice: string;
  /** Standing condition of the open document (e.g. it cannot be saved); not dismissible. */
  warning?: string;
  onDismissError(): void;
  onNoticeExpired(): void;
};

/**
 * Application messages below the top bar, outside the document column.
 * Warnings stay while their condition holds; errors stay until dismissed or resolved;
 * notices expire.
 */
export function MessageArea({ error, notice, warning = "", onDismissError, onNoticeExpired }: MessageAreaProps) {
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(onNoticeExpired, NOTICE_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [notice]);
  if (!error && !notice && !warning) return null;
  return (
    <div className="message-area" data-testid="message-area">
      {warning ? (
        <Notice tone="warning" className="message" data-testid="writeability-warning">
          <span className="message-text">{warning}</span>
        </Notice>
      ) : null}
      {error ? (
        <Notice tone="error" className="message" data-testid="error">
          <span className="message-text">{error}</span>
          <IconButton className="message-dismiss" label="Dismiss error" onClick={onDismissError}>×</IconButton>
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
