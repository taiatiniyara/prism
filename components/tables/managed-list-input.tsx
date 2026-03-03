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
}) {
  const [list, setList] = useState<ManagedListItem[]>([]);

  useEffect(() => {
    GetAllManagedLists({
      name: props.managedListName,
    }).then((res) => {
      setList(res[0].items.filter((i) => !i.name.includes("All")));
    });
  }, []);

  if (list.length === 0) {
    return <Skeleton className="w-full h-10 rounded-md" />;
  }

  return (
    <Select
      defaultValue={props.value?.toString()}
      name={props.inputName}
    >
      <SelectTrigger className="w-full shadow">
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
