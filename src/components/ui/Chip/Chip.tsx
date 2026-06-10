import type { ComponentPropsWithoutRef, ReactElement } from "react";

/**
 * Pill base (shape + typography). Colors stay with the CONSUMER on purpose:
 * tone maps are domain vocabulary (staleness, request phases, sync mode) and
 * their exact recipes differ deliberately — the primitive only kills the
 * repeated structural classes.
 */
export type ChipSize = "xs" | "2xs";

const SIZE_STYLES: Readonly<Record<ChipSize, string>> = {
  xs: "text-xs",
  "2xs": "text-[11px]",
};

export interface ChipProps extends ComponentPropsWithoutRef<"span"> {
  readonly size?: ChipSize;
}

export function Chip({
  size = "xs",
  className = "",
  children,
  ...rest
}: ChipProps): ReactElement {
  return (
    <span
      className={`rounded-full px-2 py-0.5 font-medium ${SIZE_STYLES[size]} ${className}`}
      {...rest}
    >
      {children}
    </span>
  );
}
