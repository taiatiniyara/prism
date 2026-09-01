import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface LabeledContentBlockProps {
  label: string;
  children: ReactNode;
  className?: string;
  labelClassName?: string;
}

export default function LabeledContentBlock({
  label,
  children,
  className,
  labelClassName,
}: LabeledContentBlockProps) {
  return (
    <div className={className}>
      <p
        className={cn(
          "mb-1 text-xs font-medium text-muted-foreground",
          labelClassName,
        )}
      >
        {label}
      </p>
      {children}
    </div>
  );
}
