import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface BorderedPanelProps {
  children: ReactNode;
  className?: string;
}

export default function BorderedPanel({
  children,
  className,
}: BorderedPanelProps) {
  return (
    <div className={cn("rounded-md border p-4", className)}>{children}</div>
  );
}
