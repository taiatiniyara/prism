import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface BorderedGridProps {
  children: ReactNode;
  className?: string;
}

export default function BorderedGrid({
  children,
  className,
}: BorderedGridProps) {
  return <div className={cn("rounded border p-2", className)}>{children}</div>;
}
