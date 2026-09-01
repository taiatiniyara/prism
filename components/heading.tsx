import { forwardRef, HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const headingVariants = cva("text-foreground tracking-tight", {
  variants: {
    level: {
      1: "text-4xl lg:text-5xl font-extrabold",
      2: "text-3xl lg:text-4xl font-bold",
      3: "text-2xl lg:text-3xl font-semibold",
      4: "text-xl lg:text-2xl font-semibold",
      5: "text-lg lg:text-xl font-medium",
      6: "text-base lg:text-lg font-medium",
    },
  },
  defaultVariants: {
    level: 1,
  },
});

export interface HeadingProps
  extends
    HTMLAttributes<HTMLHeadingElement>,
    VariantProps<typeof headingVariants> {
  level?: 1 | 2 | 3 | 4 | 5 | 6;
}

export const Heading = forwardRef<HTMLHeadingElement, HeadingProps>(
  ({ className, level = 1, children, ...props }, ref) => {
    const Tag = `h${level}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
    return (
      <Tag
        ref={ref}
        className={cn(headingVariants({ level, className }))}
        {...props}
      >
        {children}
      </Tag>
    );
  },
);

Heading.displayName = "Heading";
