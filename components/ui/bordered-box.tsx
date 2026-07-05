import { ReactNode, ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/utils";

type BorderedBoxProps = {
  children: ReactNode;
  className?: string;
  variant?: "stack" | "grid" | "panel" | "form";
} & ComponentPropsWithoutRef<"div">;

const variantClasses: Record<string, string> = {
  stack: "rounded border",
  grid: "rounded border p-2",
  panel: "rounded-md border p-4",
};

export default function BorderedBox({
  children,
  className,
  variant = "panel",
  ...props
}: BorderedBoxProps) {
  if (variant === "form") {
    return (
      <form className={cn("rounded-md border p-4", className)} {...(props as ComponentPropsWithoutRef<"form">)}>
        {children}
      </form>
    );
  }

  return (
    <div className={cn(variantClasses[variant], className)} {...props}>
      {children}
    </div>
  );
}
