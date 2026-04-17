import { ReactNode } from "react";
import { Label } from "@/components/ui/label";

interface FieldGroupProps {
  label: string;
  htmlFor: string;
  children: ReactNode;
  error?: string;
  errorId?: string;
  containerClassName?: string;
  labelClassName?: string;
}

export function FieldGroup({
  label,
  htmlFor,
  children,
  error,
  errorId,
  containerClassName,
  labelClassName,
}: FieldGroupProps) {
  return (
    <div className={containerClassName ?? "space-y-1"}>
      <Label
        className={labelClassName ?? "text-sm font-medium"}
        htmlFor={htmlFor}
      >
        {label}
      </Label>
      {children}
      {error && errorId ? (
        <p
          id={errorId}
          className="text-xs text-destructive"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
