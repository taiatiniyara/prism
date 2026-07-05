import { ReactNode, ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/utils";

type BorderedPanelProps = {
  children: ReactNode;
  className?: string;
} & ComponentPropsWithoutRef<"div">;

export default function BorderedPanel({
  children,
  className,
  ...props
}: BorderedPanelProps) {
  return (
    <div className={cn("rounded-md border p-4", className)} {...props}>
      {children}
    </div>
  );
}
