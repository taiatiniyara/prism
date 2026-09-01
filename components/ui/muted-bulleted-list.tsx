import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface MutedBulletedListProps {
  children: ReactNode;
  className?: string;
}

export default function MutedBulletedList({
  children,
  className,
}: MutedBulletedListProps) {
  return (
    <ul
      className={cn(
        "list-disc space-y-1 rounded border bg-muted/20 p-3 pl-7 text-xs sm:text-sm",
        className,
      )}
    >
      {children}
    </ul>
  );
}
