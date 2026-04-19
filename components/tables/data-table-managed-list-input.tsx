"use client";

import { GetAllManagedLists } from "@/app/settings/managed-lists/service";
import {
  DataEntrySelect,
  type DataEntrySelectOption,
} from "@/components/data-entry/dataEntrySelect";
import { ManagedListItem } from "@/db/schema/managedLists";
import { useEffect, useState } from "react";
import { Skeleton } from "../ui/skeleton";

export default function DataTableManagedListInput(props: {
  managedListName: string;
  inputName: string;
  value?: number;
  disabled?: boolean;
}) {
  const [list, setList] = useState<ManagedListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isCancelled = false;

    GetAllManagedLists({
      name: props.managedListName,
    })
      .then((res) => {
        if (isCancelled) {
          return;
        }

        const items = res?.[0]?.items ?? [];
        setList(
          items.filter((item) => !item.name.includes("All") && item.is_active),
        );
      })
      .catch(() => {
        if (!isCancelled) {
          setList([]);
        }
      })
      .finally(() => {
        if (!isCancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [props.managedListName]);

  if (isLoading) {
    return <Skeleton className="w-full h-9 rounded-md" />;
  }

  if (list.length === 0) {
    return (
      <DataEntrySelect
        name={props.inputName}
        disabled
        value="__empty"
        placeholder="No managed-list options available"
        triggerClassName="rounded-md border border-input"
        options={[
          {
            value: "__empty",
            label: "No managed-list options available",
            disabled: true,
          },
        ]}
      />
    );
  }

  const defaultSelectedValue =
    props.value != null ? String(props.value) : undefined;
  const options: DataEntrySelectOption[] = list.map((item) => ({
    value: String(item.id),
    label: item.name,
  }));

  return (
    <DataEntrySelect
      defaultValue={defaultSelectedValue}
      name={props.inputName}
      disabled={props.disabled}
      placeholder="Select"
      triggerClassName="rounded-md border border-input"
      options={options}
    />
  );
}
