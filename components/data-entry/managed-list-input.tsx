"use client";

import { GetAllManagedLists } from "@/app/settings/managed-lists/service";
import { ManagedListItem } from "@/db/schema/managedLists";
import { byIdAsc, isAllSentinelName } from "@/lib/managed-lists";
import { useEffect, useState } from "react";
import {
  DataEntrySelect,
  type DataEntrySelectOption,
} from "@/components/data-entry/dataEntrySelect";
import { Skeleton } from "@/components/ui/skeleton";

export default function DataEntryManagedListInput(props: {
  managedListName: string;
  inputName: string;
  value?: number;
  valueName?: string | null;
  onValueNameChange?: (valueName: string) => void;
  disabled?: boolean;
  hasValue?: boolean;
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
          items
            .filter((i) => i.is_active === true && !isAllSentinelName(i.name))
            .sort(byIdAsc),
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
    return <Skeleton className="w-full h-10 rounded-md" />;
  }

  if (list.length === 0) {
    return (
      <DataEntrySelect
        name={props.inputName}
        disabled
        value="__empty"
        size="input"
        placeholder="No managed-list options available"
        options={[
          {
            value: "__empty",
            label: "No managed-list options available",
            disabled: true,
          },
        ]}
        triggerClassName={`border-l-7 rounded-l-none rounded-r-lg ${
          props.hasValue ? "border-l-lime-200" : "border-l-red-200"
        }`}
      />
    );
  }

  const selectedIdFromName =
    props.valueName == null
      ? undefined
      : list.find((item) => item.name === props.valueName)?.id;
  const selectedValue =
    props.value != null
      ? props.value.toString()
      : selectedIdFromName != null
        ? selectedIdFromName.toString()
        : undefined;
  const selectOptions: DataEntrySelectOption[] = list.map((item) => ({
    value: item.id!.toString(),
    label: item.name,
  }));

  return (
    <DataEntrySelect
      value={selectedValue}
      name={props.inputName}
      disabled={props.disabled}
      size="input"
      onValueChange={(nextValue) => {
        const selectedItem = list.find((item) => String(item.id) === nextValue);
        if (selectedItem && props.onValueNameChange) {
          props.onValueNameChange(selectedItem.name);
        }
      }}
      placeholder="Select input"
      options={selectOptions}
      triggerClassName={`border-l-7 rounded-l-none rounded-r-lg ${
        props.hasValue ? "border-l-lime-200" : "border-l-red-200"
      }`}
    />
  );
}
