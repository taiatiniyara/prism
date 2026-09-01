import { ReactNode } from "react";
import { cn } from "@/lib/utils";

type FieldGroupProps = {
  label: string;
  htmlFor?: string;
  children: ReactNode;
  containerClassName?: string;
  labelClassName?: string;
  error?: string;
  errorId?: string;
};

export function FieldGroup({
  label,
  htmlFor,
  children,
  containerClassName,
  labelClassName,
  error,
  errorId,
}: FieldGroupProps) {
  return (
    <div className={cn("flex flex-col gap-1", containerClassName)}>
      <label
        htmlFor={htmlFor}
        className={cn("text-sm font-medium", labelClassName)}
      >
        {label}
      </label>
      {children}
      {error && (
        <p id={errorId} className="text-xs text-red-500" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
