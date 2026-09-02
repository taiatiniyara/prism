"use client";

import { GetAllManagedListItems } from "@/app/settings/managed-lists/service";
import {
  DataEntrySelect,
  type DataEntrySelectOption,
} from "@/components/data-entry/dataEntrySelect";
import { ManagedListItem } from "@/db/schema/managedLists";
import { byIdAsc, isAllSentinelName } from "@/lib/managed-lists";
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

    const aliases = Array.from(
      new Set(
        props.managedListName
          .split("|")
          .map((name) => name.trim())
          .filter((name) => name.length > 0),
      ),
    );

    if (aliases.length === 0) {
      Promise.resolve().then(() => {
        if (!isCancelled) {
          setList([]);
          setIsLoading(false);
        }
      });
      return;
    }

    Promise.all(
      aliases.map((listName) =>
        GetAllManagedListItems({
          listName,
          excludeAll: true,
        }),
      ),
    )
      .then((resultSets) => {
        if (isCancelled) {
          return;
        }

        const merged = new Map<number, ManagedListItem>();
        for (const set of resultSets) {
          for (const item of set) {
            if (!item.is_active) {
              continue;
            }
            // Hide only the aggregate "All …" sentinel, not real items that
            // merely contain "all" (Small, Allied, …).
            if (isAllSentinelName(item.name)) {
              continue;
            }
            merged.set(item.id, item);
          }
        }

        // Order by id ascending (the intended logical order), not alphabetical.
        setList(Array.from(merged.values()).sort(byIdAsc));
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
