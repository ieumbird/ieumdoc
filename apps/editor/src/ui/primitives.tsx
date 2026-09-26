import { forwardRef, type ButtonHTMLAttributes, type HTMLAttributes } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "subtle";
  size?: "sm" | "md";
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, size = "md", variant = "primary", type = "button", ...props },
  ref,
) {
  return (
    <button
      {...props}
      ref={ref}
      type={type}
      className={cx("ui-button", `ui-button--${size}`, `ui-button--${variant}`, className)}
    />
  );
});

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { className, label, type = "button", ...props },
  ref,
) {
  return (
    <button
      {...props}
      ref={ref}
      type={type}
      aria-label={label}
      className={cx("ui-icon-button", className)}
    />
  );
});

type NoticeProps = HTMLAttributes<HTMLDivElement> & {
  tone?: "info" | "warning" | "error";
};

export function Notice({ className, role, tone = "info", ...props }: NoticeProps) {
  return (
    <div
      {...props}
      role={role ?? (tone === "error" ? "alert" : "status")}
      className={cx("ui-notice", `ui-notice--${tone}`, className)}
    />
  );
}

function cx(...values: Array<string | undefined>): string {
  return values.filter(Boolean).join(" ");
}
