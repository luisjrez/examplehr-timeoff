"use client";

import type { ComponentPropsWithoutRef, ReactElement } from "react";

/**
 * The only place raw <button> markup lives (plan-0002 acceptance).
 * Variants/sizes preserve the exact class recipes the app already shipped,
 * so adopting the primitive is visually neutral.
 */
export type ButtonVariant =
  | "primary"
  | "success"
  | "danger"
  | "ghost"
  /** Unstyled escape hatch (e.g. the toast's ✕); styling via className. */
  | "plain";

export type ButtonSize = "md" | "sm" | "xs" | "2xs" | "none";

const VARIANT_STYLES: Readonly<Record<ButtonVariant, string>> = {
  primary: "rounded-md bg-blue-600 text-white hover:bg-blue-700",
  success: "rounded-md bg-emerald-600 text-white hover:bg-emerald-700",
  danger: "rounded-md bg-red-600 text-white hover:bg-red-700",
  ghost:
    "rounded-md border border-gray-300 dark:border-zinc-600 hover:bg-gray-50 dark:hover:bg-zinc-800",
  plain: "",
};

const SIZE_STYLES: Readonly<Record<ButtonSize, string>> = {
  md: "px-4 py-2 text-sm",
  sm: "px-4 py-1.5 text-sm",
  xs: "px-3 py-1 text-xs",
  "2xs": "px-2 py-0.5",
  none: "",
};

const DISABLED_STYLES = "disabled:cursor-not-allowed disabled:opacity-50";

export interface ButtonProps extends ComponentPropsWithoutRef<"button"> {
  readonly variant: ButtonVariant;
  readonly size?: ButtonSize;
}

export function Button({
  variant,
  size = "md",
  className = "",
  // Explicit default: a bare <button> inside a form submits it — the only
  // submit button in this app opts in with type="submit".
  type = "button",
  children,
  ...rest
}: ButtonProps): ReactElement {
  const classes = [
    VARIANT_STYLES[variant],
    SIZE_STYLES[size],
    variant === "plain" ? "" : DISABLED_STYLES,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button type={type} className={classes} {...rest}>
      {children}
    </button>
  );
}
