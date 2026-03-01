"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { authClient } from "@/lib/auth-client";
import { User } from "lucide-react";

export default function UserDropdown(props: {
  orgAcronym?: string;
  role?: string;
  fullName?: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex font-extrabold text-xs items-center gap-1 hover:bg-slate-800 px-3 py-2 rounded-md cursor-pointer hover:outline transition-all">
        <User />
        <span className="text-slate-300">{props.orgAcronym}</span>
        <span className="text-amber-400">{props.role}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>{props.fullName || "My Account"}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => {
            window.location.href = "/profile";
          }}
        >
          Profile
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={async () => {
            await authClient.signOut();
            window.location.href = "/";
          }}
        >
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
