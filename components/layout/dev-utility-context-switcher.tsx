"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type UtilityOption = {
  id: number;
  name: string;
  acronym: string | null;
};

export default function DevUtilityContextSwitcher(props: {
  options: UtilityOption[];
  selectedOrganisationId: number | null;
  isScoped: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selectedValue, setSelectedValue] = useState<string>(
    props.isScoped && props.selectedOrganisationId != null
      ? String(props.selectedOrganisationId)
      : "",
  );

  const onChange = (nextValue: string) => {
    setSelectedValue(nextValue);

    startTransition(async () => {
      try {
        await fetch("/api/context/organisation", {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            organisationId: nextValue === "" ? null : Number(nextValue),
          }),
        });
      } finally {
        router.refresh();
      }
    });
  };

  return (
    <div className="flex items-center gap-2 rounded-md bg-slate-800/70 px-2 py-1">
      <label
        htmlFor="dev-utility-context"
        className="text-[11px] text-slate-300"
      >
        Utility
      </label>
      <select
        id="dev-utility-context"
        value={selectedValue}
        onChange={(event) => onChange(event.target.value)}
        disabled={isPending}
        className="rounded border border-slate-600 bg-slate-900 px-2 py-1 text-xs text-white focus:outline-hidden focus:ring-1 focus:ring-amber-400"
      >
        <option value="">All Utilities</option>
        {props.options.map((option) => (
          <option
            key={option.id}
            value={option.id}
          >
            {option.acronym
              ? `${option.acronym} - ${option.name}`
              : option.name}
          </option>
        ))}
      </select>
    </div>
  );
}
