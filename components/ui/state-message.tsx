import { ReactNode } from "react";

type StateMessageVariant = "empty" | "loading" | "error";

interface StateMessageProps {
  children: ReactNode;
  variant?: StateMessageVariant;
  className?: string;
  role?: "alert" | "status";
  ariaLive?: "polite" | "assertive";
}

function classesForVariant(variant: StateMessageVariant): string {
  if (variant === "loading") {
    return "rounded-md border bg-muted/30 p-2 text-xs sm:text-sm";
  }
  if (variant === "error") {
    return "rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive sm:text-sm";
  }
  return "rounded-md border bg-muted/20 p-2 text-xs sm:text-sm";
}

export default function StateMessage({
  children,
  variant = "empty",
  className,
  role,
  ariaLive,
}: StateMessageProps) {
  const mergedClassName = className
    ? `${classesForVariant(variant)} ${className}`
    : classesForVariant(variant);

  return (
    <div
      className={mergedClassName}
      role={role}
      aria-live={ariaLive}
    >
      {children}
    </div>
  );
}
