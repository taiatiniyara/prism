import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface BorderedStackProps {
  children: ReactNode;
  className?: string;
}

export default function BorderedStack({
  children,
  className,
}: BorderedStackProps) {
  return <div className={cn("rounded border", className)}>{children}</div>;
}
