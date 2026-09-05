import { ReactNode } from "react";

type ReviewKpiSectionTone = "sky" | "amber" | "lime";

interface ReviewKpiSectionProps {
  tone: ReviewKpiSectionTone;
  title: string;
  children: ReactNode;
}

const sectionClassesByTone: Record<ReviewKpiSectionTone, string> = {
  sky: "space-y-1.5 rounded-md border border-sky-200/80 border-l-7 bg-sky-50/30 p-2 dark:border-sky-900/60 dark:bg-sky-950/15",
  amber:
    "space-y-1.5 rounded-md border border-amber-200/80 border-l-7 bg-amber-50/40 p-2 dark:border-amber-900/60 dark:bg-amber-950/20",
  lime: "space-y-1.5 rounded-md border border-success/40/80 border-l-7 bg-success/10/40 p-2 dark:border-lime-900/60 dark:bg-lime-950/20",
};

const headingClassesByTone: Record<ReviewKpiSectionTone, string> = {
  sky: "text-[11px] font-semibold uppercase tracking-wide text-sky-700 dark:text-sky-300",
  amber:
    "text-[11px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300",
  lime: "text-[11px] font-semibold uppercase tracking-wide text-success dark:text-success",
};

export function ReviewKpiSection({
  tone,
  title,
  children,
}: ReviewKpiSectionProps) {
  return (
    <section className={sectionClassesByTone[tone]}>
      <h3 className={headingClassesByTone[tone]}>{title}</h3>
      {children}
    </section>
  );
}
