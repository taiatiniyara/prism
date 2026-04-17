import { Heading } from "@/components/heading";
import { ReactNode } from "react";

interface SettingsSectionProps {
  title: string;
  description?: string;
  children: ReactNode;
}

export default function SettingsSection(props: SettingsSectionProps) {
  return (
    <section className="space-y-3">
      <Heading level={4}>{props.title}</Heading>
      {props.description ? (
        <p className="text-muted-foreground w-1/2 mt-2">{props.description}</p>
      ) : null}
      {props.children}
    </section>
  );
}
