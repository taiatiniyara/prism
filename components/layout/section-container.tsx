import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface SectionContainerProps {
  children: ReactNode;
  className?: string;
}

export default function SectionContainer({
  children,
  className,
}: SectionContainerProps) {
  return (
    <section className={cn("rounded-xl border bg-card p-4 sm:p-6", className)}>
      {children}
    </section>
  );
}
