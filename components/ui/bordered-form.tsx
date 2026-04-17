import { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/utils";

type BorderedFormProps = ComponentPropsWithoutRef<"form">;

export default function BorderedForm({
  className,
  children,
  ...props
}: BorderedFormProps) {
  return (
    <form
      className={cn("rounded-md border p-4", className)}
      {...props}
    >
      {children}
    </form>
  );
}
