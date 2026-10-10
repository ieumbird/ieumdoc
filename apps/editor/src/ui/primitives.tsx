import type { HTMLAttributes } from "react";
import { cn } from "../lib/utils.ts";

type NoticeProps = HTMLAttributes<HTMLDivElement> & {
  tone?: "info" | "warning" | "error";
};

export function Notice({ className, role, tone = "info", ...props }: NoticeProps) {
  return (
    <div
      {...props}
      role={role ?? (tone === "error" ? "alert" : "status")}
      className={cn("ui-notice", `ui-notice--${tone}`, className)}
    />
  );
}
