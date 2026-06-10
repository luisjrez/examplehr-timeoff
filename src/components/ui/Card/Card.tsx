import type { ElementType, HTMLAttributes, ReactElement } from "react";

/**
 * Bordered container — the repeated `rounded-* border …` recipe extracted.
 * Layout (flex/grid/gap) stays with the consumer via className.
 */
export type CardRounding = "xl" | "lg";
export type CardPadding = "4" | "3";

const ROUNDED_STYLES: Readonly<Record<CardRounding, string>> = {
  xl: "rounded-xl",
  lg: "rounded-lg",
};

const PADDING_STYLES: Readonly<Record<CardPadding, string>> = {
  "4": "p-4",
  "3": "p-3",
};

// HTMLAttributes<HTMLElement> (not a per-tag type): handlers stay assignable
// for every rendered tag, since event types are contravariant in the element.
export interface CardProps extends HTMLAttributes<HTMLElement> {
  readonly as?: "div" | "li" | "form";
  readonly rounded?: CardRounding;
  readonly padding?: CardPadding;
}

export function Card({
  as = "div",
  rounded = "xl",
  padding = "4",
  className = "",
  children,
  ...rest
}: CardProps): ReactElement {
  const Tag: ElementType = as;
  return (
    <Tag
      className={`${ROUNDED_STYLES[rounded]} border border-gray-200 dark:border-zinc-700 ${PADDING_STYLES[padding]} ${className}`}
      {...rest}
    >
      {children}
    </Tag>
  );
}
