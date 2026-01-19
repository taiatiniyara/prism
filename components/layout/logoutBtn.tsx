"use client";

import { LogOut } from "lucide-react";
import { Button } from "../ui/button";
import { authClient } from "@/lib/auth-client";
import { toast } from "sonner";

export default function LogoutBtn() {
  return (
    <Button
      className="cursor-pointer hover:border hover:border-amber-400"
      onClick={() => {
        authClient.signOut().then(() => {
          toast.success("Successfully signed out");
          window.location.href = "/";
        });
      }}
    >
      <LogOut /> Sign Out
    </Button>
  );
}
