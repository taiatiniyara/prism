"use client";

import { GetAllManagedLists } from "@/app/settings/managed-lists/service";
import { ManagedListItem } from "@/db/schema/managedLists";
import { useEffect, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatLabel } from "@/lib/formatters";
import { Skeleton } from "../ui/skeleton";

export default function ManagedListInput(props: {
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
        setList(items.filter((i) => !i.name.includes("All")));
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
      <Select
        name={props.inputName}
        disabled
      >
        <SelectTrigger
          className={`w-full shadow border-l-8 p-2.5 rounded-lg ${
            props.hasValue ? "border-l-lime-200" : "border-l-red-200"
          }`}
        >
          <SelectValue placeholder="No managed-list options available" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem
            value="__empty"
            disabled
          >
            No managed-list options available
          </SelectItem>
        </SelectContent>
      </Select>
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

  return (
    <Select
      value={selectedValue}
      name={props.inputName}
      disabled={props.disabled}
      onValueChange={(nextValue) => {
        const selectedItem = list.find((item) => String(item.id) === nextValue);
        if (selectedItem && props.onValueNameChange) {
          props.onValueNameChange(selectedItem.name);
        }
      }}
    >
      <SelectTrigger
        className={`w-full shadow border-l-8 p-2.5 rounded-lg ${
          props.hasValue ? "border-l-lime-200" : "border-l-red-200"
        }`}
      >
        <SelectValue placeholder={`Select ${formatLabel(props.inputName)}`} />
      </SelectTrigger>
      <SelectContent>
        {list.map((item) => (
          <SelectItem
            key={item.id}
            value={item.id!.toString()}
          >
            {item.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
