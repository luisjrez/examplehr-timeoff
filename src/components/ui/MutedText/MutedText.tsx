import type { ComponentPropsWithoutRef, ReactElement } from "react";

/** Secondary copy (empty states, helper messages) — one recipe, one place. */
export function MutedText({
  className = "",
  children,
  ...rest
}: ComponentPropsWithoutRef<"p">): ReactElement {
  return (
    <p
      className={`text-sm text-gray-500 dark:text-zinc-400 ${className}`}
      {...rest}
    >
      {children}
    </p>
  );
}
