import type { HTMLAttributes, ReactNode } from "react";
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

/** A correctable input error; callers connect its id with aria-describedby. */
export function FieldError({ id, children }: { id: string; children: ReactNode }) {
  return children ? <p id={id} className="form-error" role="alert">{children}</p> : null;
}
