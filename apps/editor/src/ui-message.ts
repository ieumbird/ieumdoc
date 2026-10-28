import { useState } from "react";
import { i18n, type MessageKey } from "./i18n.ts";
import { en } from "./locales.ts";

/** Keep application messages unresolved until display; external technical details stay literal. */
type ParametersIn<S extends string> = S extends `${string}{{${infer Name}}}${infer Rest}` ? Name | ParametersIn<Rest> : never;
export type UiMessage = string | Error | { [K in MessageKey]: { key: K } &
  (ParametersIn<typeof en[K]> extends never ? { values?: never } : { values: { [P in ParametersIn<typeof en[K]>]: P extends "count" ? number : string | number } })
}[MessageKey];
export function messageText(message: UiMessage): string {
  if (typeof message === "string") return message;
  if (message instanceof Error) return message instanceof UiError ? messageText(message.detail) : message.message;
  // UiMessage checks key/parameter correlation at creation; i18next sees a dynamic union here.
  const key: string = message.key;
  return i18n.t(key, { ...message.values, defaultValue: en[message.key] });
}
/** Application-owned failures carry their message identity through asynchronous callbacks. */
export class UiError extends Error {
  constructor(readonly detail: Exclude<UiMessage, string | Error>) {
    super(messageText(detail));
    this.name = "UiError";
  }
}
export function useMessageState(initial: UiMessage = "") {
  const [message, setMessage] = useState<UiMessage>(initial);
  return [messageText(message), setMessage, message] as const;
}
