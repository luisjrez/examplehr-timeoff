import type { ReactElement, ReactNode } from "react";

interface FormFieldProps {
  readonly label: string;
  readonly htmlFor: string;
  readonly children: ReactNode;
}

/** Label + control column — the repeated form-field recipe extracted. */
export function FormField({
  label,
  htmlFor,
  children,
}: FormFieldProps): ReactElement {
  return (
    <div className="flex flex-col gap-1">
      <label
        htmlFor={htmlFor}
        className="text-xs text-gray-600 dark:text-zinc-300"
      >
        {label}
      </label>
      {children}
    </div>
  );
}
