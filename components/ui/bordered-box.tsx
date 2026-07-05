import { ReactNode, ComponentPropsWithoutRef, FormEventHandler } from "react";
import { cn } from "@/lib/utils";

type BorderedBoxProps = {
  children: ReactNode;
  className?: string;
  variant?: "stack" | "grid" | "panel" | "form";
  onSubmit?: FormEventHandler<HTMLFormElement>;
  noValidate?: boolean;
} & Omit<ComponentPropsWithoutRef<"div">, "onSubmit" | "noValidate">;

const variantClasses: Record<string, string> = {
  stack: "rounded border",
  grid: "rounded border p-2",
  panel: "rounded-md border p-4",
};

export default function BorderedBox({
  children,
  className,
  variant = "panel",
  onSubmit,
  noValidate,
  ...divProps
}: BorderedBoxProps) {
  if (variant === "form") {
    return (
      <form
        className={cn("rounded-md border p-4", className)}
        onSubmit={onSubmit}
        noValidate={noValidate}
      >
        {children}
      </form>
    );
  }

  return (
    <div className={cn(variantClasses[variant], className)} {...divProps}>
      {children}
    </div>
  );
}
