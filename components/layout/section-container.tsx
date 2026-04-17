import { ReactNode } from "react";

interface SectionContainerProps {
  children: ReactNode;
  className?: string;
}

export default function SectionContainer({
  children,
  className,
}: SectionContainerProps) {
  return (
    <section
      className={
        className
          ? `rounded-xl border bg-card p-4 sm:p-6 ${className}`
          : "rounded-xl border bg-card p-4 sm:p-6"
      }
    >
      {children}
    </section>
  );
}
