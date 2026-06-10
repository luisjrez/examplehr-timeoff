import type { ReactElement, ReactNode } from "react";

interface ViewSectionProps {
  readonly ariaLabel: string;
  /** Optional visible heading; some sections are labelled but heading-less. */
  readonly title?: string;
  readonly className?: string;
  readonly children: ReactNode;
}

/** Labelled view section with the app's standard heading scale. */
export function ViewSection({
  ariaLabel,
  title,
  className,
  children,
}: ViewSectionProps): ReactElement {
  return (
    <section aria-label={ariaLabel} {...(className ? { className } : {})}>
      {title ? <h2 className="text-lg font-medium">{title}</h2> : null}
      {children}
    </section>
  );
}
