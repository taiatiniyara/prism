"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Check, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ExternalRegistration } from "@/db/schema/auth-schema";
import { DataTableFormResponse } from "@/components/tables/data-table-create-form";

interface Props {
  registrations: ExternalRegistration[];
  roles: { value: number; label: string }[];
  acceptAction: (
    registrationId: number,
    roleId: number,
  ) => Promise<DataTableFormResponse<ExternalRegistration>>;
  rejectAction: (
    registrationId: number,
  ) => Promise<DataTableFormResponse<ExternalRegistration>>;
}

export default function ExternalRegistrationActionPanel({
  registrations,
  roles,
  acceptAction,
  rejectAction,
}: Props) {
  const [selectedRoles, setSelectedRoles] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});

  const handleAccept = async (registrationId: number) => {
    const roleId = selectedRoles[registrationId];
    if (!roleId) {
      toast.error("Please select a role first.");
      return;
    }

    setLoading((prev) => ({ ...prev, [`accept-${registrationId}`]: true }));
    try {
      const result = await acceptAction(registrationId, roleId);
      if (result.success) {
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
    } catch {
      toast.error("Failed to accept registration");
    } finally {
      setLoading((prev) => ({ ...prev, [`accept-${registrationId}`]: false }));
    }
  };

  const handleReject = async (registrationId: number) => {
    setLoading((prev) => ({ ...prev, [`reject-${registrationId}`]: true }));
    try {
      const result = await rejectAction(registrationId);
      if (result.success) {
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
    } catch {
      toast.error("Failed to reject registration");
    } finally {
      setLoading((prev) => ({ ...prev, [`reject-${registrationId}`]: false }));
    }
  };

  if (registrations.length === 0) {
    return (
      <div className="text-center py-8 text-sm text-muted-foreground">
        No pending external registrations.
      </div>
    );
  }

  return (
    <div className="space-y-3 px-5 pb-5">
      <h3 className="text-sm font-semibold">Actions</h3>
      {registrations.map((reg) => (
        <div
          key={reg.id}
          className="flex items-center gap-3 rounded-lg border p-3"
        >
          <div className="flex-1 text-sm">
            <span className="font-medium">{reg.name}</span>
            <span className="text-muted-foreground"> &middot; {reg.email}</span>
          </div>
          <Select
            value={String(selectedRoles[reg.id] ?? "")}
            onValueChange={(value) =>
              setSelectedRoles((prev) => ({
                ...prev,
                [reg.id]: Number(value),
              }))
            }
          >
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Role" />
            </SelectTrigger>
            <SelectContent>
              {roles.map((role) => (
                <SelectItem key={role.value} value={String(role.value)}>
                  {role.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            variant="outline"
            className="text-lime-600 border-lime-300 hover:bg-lime-50"
            onClick={() => handleAccept(reg.id)}
            disabled={loading[`accept-${reg.id}`]}
          >
            {loading[`accept-${reg.id}`] ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="text-red-600 border-red-300 hover:bg-red-50"
            onClick={() => handleReject(reg.id)}
            disabled={loading[`reject-${reg.id}`]}
          >
            {loading[`reject-${reg.id}`] ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <X className="h-4 w-4" />
            )}
          </Button>
        </div>
      ))}
    </div>
  );
}
