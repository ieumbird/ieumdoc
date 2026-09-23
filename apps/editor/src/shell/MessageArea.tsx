import { useEffect } from "react";
import { IconButton, Notice } from "../ui/primitives.tsx";

export const NOTICE_TIMEOUT_MS = 5000;

type MessageAreaProps = {
  error: string;
  notice: string;
  onDismissError(): void;
  onNoticeExpired(): void;
};

/**
 * Application messages below the top bar, outside the document column.
 * Errors stay until dismissed or resolved; notices expire.
 */
export function MessageArea({ error, notice, onDismissError, onNoticeExpired }: MessageAreaProps) {
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(onNoticeExpired, NOTICE_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [notice]);
  if (!error && !notice) return null;
  return (
    <div className="message-area" data-testid="message-area">
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
