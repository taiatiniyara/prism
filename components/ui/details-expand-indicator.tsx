import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface DetailsExpandIndicatorProps {
  children?: ReactNode;
  className?: string;
}

export default function DetailsExpandIndicator({
  children,
  className,
}: DetailsExpandIndicatorProps) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span className="text-xs text-muted-foreground group-open:hidden">
        Expand
      </span>
      <span className="hidden text-xs text-muted-foreground group-open:inline">
        Collapse
      </span>
      {children}
    </div>
  );
}
