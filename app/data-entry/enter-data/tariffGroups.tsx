"use client";

import { useEffect, useState } from "react";

import { DataEntryTariffPaymentModeGroupView } from "@/app/data-entry/types";

import InputCell from "@/app/data-entry/enter-data/inputCell";
import { DataEntrySelect } from "@/components/data-entry/dataEntrySelect";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const STORAGE_KEY_PAYMENT_MODE = "prism:tariff:paymentModeId";
const STORAGE_KEY_CUSTOMER_TYPE_PREFIX = "prism:tariff:customerType:";

const readSessionNumber = (key: string): number | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(key);
    if (raw == null) return null;
    const n = Number(raw);
    return Number.isInteger(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
};

const writeSessionNumber = (key: string, value: number): void => {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(key, String(value));
  } catch {
    // sessionStorage may be unavailable
  }
};

const readSessionCustomerType = (
  paymentModeId: number,
): number | null => {
  return readSessionNumber(`${STORAGE_KEY_CUSTOMER_TYPE_PREFIX}${paymentModeId}`);
};

const writeSessionCustomerType = (
  paymentModeId: number,
  customerTypeId: number,
): void => {
  writeSessionNumber(`${STORAGE_KEY_CUSTOMER_TYPE_PREFIX}${paymentModeId}`, customerTypeId);
};

const selectStoredPaymentModeId = (
  groups: DataEntryTariffPaymentModeGroupView[],
  defaultValue: number,
): number => {
  const stored = readSessionNumber(STORAGE_KEY_PAYMENT_MODE);
  if (stored != null && groups.some((g) => g.paymentModeId === stored)) {
    return stored;
  }
  return defaultValue;
};

const selectStoredCustomerTypes = (
  groups: DataEntryTariffPaymentModeGroupView[],
): Record<number, number> => {
  const result: Record<number, number> = {};
  for (const group of groups) {
    const stored = readSessionCustomerType(group.paymentModeId);
    if (
      stored != null &&
      group.customerTypeGroups.some((ct) => ct.customerTypeId === stored)
    ) {
      result[group.paymentModeId] = stored;
    }
  }
  return result;
};

interface TariffGroupsProps {
  groups: DataEntryTariffPaymentModeGroupView[];
}

export default function TariffGroups({ groups }: TariffGroupsProps) {
  const fallbackPaymentModeId = groups[0]?.paymentModeId ?? 0;

  const [openPaymentModeId, setOpenPaymentModeId] =
    useState<number>(fallbackPaymentModeId);
  const [activeCustomerTypeByPaymentMode, setActiveCustomerTypeByPaymentMode] =
    useState<Record<number, number>>({});
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const storedPaymentId = selectStoredPaymentModeId(
      groups,
      fallbackPaymentModeId,
    );
    if (storedPaymentId !== openPaymentModeId) {
      setOpenPaymentModeId(storedPaymentId);
    }

    const storedCustomerTypes = selectStoredCustomerTypes(groups);
    if (Object.keys(storedCustomerTypes).length > 0) {
      setActiveCustomerTypeByPaymentMode(storedCustomerTypes);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups]);

  if (groups.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Tariff Inputs</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground text-sm">
          No tariff inputs are available. Check that a service area is selected,
          input definitions exist for Tariff Structure under Settings &gt;
          Inputs, and the tariff relevance has been configured under Settings
          &gt; Relevance.
        </CardContent>
      </Card>
    );
  }

  const activePaymentMode =
    groups.find((group) => group.paymentModeId === openPaymentModeId) ??
    groups[0];

  const activeCustomerTypeId =
    activeCustomerTypeByPaymentMode[activePaymentMode.paymentModeId] ??
    activePaymentMode.customerTypeGroups[0]?.customerTypeId;

  const activeCustomerTypeGroup =
    activePaymentMode.customerTypeGroups.find(
      (customerTypeGroup) =>
        customerTypeGroup.customerTypeId === activeCustomerTypeId,
    ) ?? activePaymentMode.customerTypeGroups[0];

  const normalizedQuery = searchQuery.trim().toLowerCase();

  const visibleRows = !activeCustomerTypeGroup
    ? []
    : !normalizedQuery
      ? activeCustomerTypeGroup.rows
      : activeCustomerTypeGroup.rows.filter((row) =>
          row.inputName.toLowerCase().includes(normalizedQuery),
        );

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-800">
        <strong>Note:</strong> Tariff values entered below must{" "}
        <strong>EXCLUDE</strong> tax (VAT/GST).
      </div>
      <div className="sticky top-0 z-20 rounded-md border bg-white p-3 shadow-sm">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-600">
              Payment Mode
            </label>
            <DataEntrySelect
              value={String(activePaymentMode.paymentModeId)}
              size="input"
              onValueChange={(nextValue) => {
                const nextPaymentModeId = Number(nextValue);
                setOpenPaymentModeId(nextPaymentModeId);
                writeSessionNumber(STORAGE_KEY_PAYMENT_MODE, nextPaymentModeId);
                setSearchQuery("");
              }}
              placeholder="Select payment mode"
              options={groups.map((group) => ({
                value: String(group.paymentModeId),
                label: group.paymentModeName,
              }))}
            />
          </div>

          <div className="space-y-1 md:col-span-2">
            <label className="text-xs font-medium text-slate-600">
              Search Data Label
            </label>
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Filter inputs in selected customer type"
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
            />
          </div>
        </div>
      </div>

      <div className="rounded-md border bg-white">
        <div className="px-4 py-3">
          <div className="mb-4 flex flex-wrap gap-2">
            {activePaymentMode.customerTypeGroups.map((customerTypeGroup) => {
              const isActive =
                customerTypeGroup.customerTypeId === activeCustomerTypeId;

              return (
                <button
                  key={customerTypeGroup.customerTypeId}
                  type="button"
                  onClick={() => {
                    const nextId = customerTypeGroup.customerTypeId;
                    setActiveCustomerTypeByPaymentMode((prev) => ({
                      ...prev,
                      [activePaymentMode.paymentModeId]: nextId,
                    }));
                    writeSessionCustomerType(
                      activePaymentMode.paymentModeId,
                      nextId,
                    );
                  }}
                  className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                    isActive
                      ? "bg-slate-700 text-white border-slate-700"
                      : "bg-white text-slate-700 border-slate-300 hover:bg-slate-100"
                  }`}
                >
                  {customerTypeGroup.customerTypeName}
                </button>
              );
            })}
          </div>

          {activeCustomerTypeGroup ? (
            <section>
              {visibleRows.length === 0 ? (
                <p className="text-sm text-slate-500">
                  No matching inputs for this customer type.
                </p>
              ) : (
                <div className="grid lg:grid-cols-3 gap-6 sm:grid-cols-1 md:grid-cols-2">
                  {visibleRows.map((row) => (
                    <div
                      key={`${activePaymentMode.paymentModeId}-${activeCustomerTypeGroup.customerTypeId}-${row.inputDefId}`}
                    >
                      <div className="flex justify-between items-end">
                        <span className="font-semibold text-sm">
                          {`${activePaymentMode.paymentModeName} - ${activeCustomerTypeGroup.customerTypeName} - ${row.inputName}`}
                        </span>
                        {row.unitName ? (
                          <span className="text-xs text-slate-500">
                            {row.unitName}
                          </span>
                        ) : null}
                      </div>
                      <InputCell
                        key={`${activePaymentMode.paymentModeId}-${activeCustomerTypeGroup.customerTypeId}-${row.inputDefId}-${row.dataEntryId ?? "new"}-${row.updatedAt ?? "na"}-${row.isDataNotAvailable ? 1 : 0}`}
                        row={row}
                      />
                    </div>
                  ))}
                </div>
              )}
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
