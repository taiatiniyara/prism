import { DataEntryInputRowView } from "@/app/data-entry/types";

import InputCell from "@/app/data-entry/enter-data/inputCell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface InputRowsProps {
  rows: DataEntryInputRowView[];
  hasFilterSelection?: boolean;
  hasDefinitions?: boolean;
}

export default function InputRows({
  rows,
  hasFilterSelection = true,
  hasDefinitions = true,
}: InputRowsProps) {
  if (rows.length === 0) {
    let emptyReason: string;
    if (!hasFilterSelection) {
      emptyReason =
        "Please select a report period and subcategory above to view input rows.";
    } else if (!hasDefinitions) {
      emptyReason =
        "No input definitions have been configured for this subcategory. Run the migration from Settings > Migration, or create input definitions under Settings > Inputs.";
    } else {
      emptyReason =
        "All input definitions for this subcategory have been marked as not relevant. Check your relevance settings under Settings > Relevance.";
    }

    return (
      <Card>
        <CardHeader>
          <CardTitle>Input Rows</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground text-sm">
          {emptyReason}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid lg:grid-cols-3 gap-6 sm:grid-cols-1 md:grid-cols-2">
      {rows.map((row) => (
        <div key={row.inputDefId}>
          <div className="flex justify-between items-end">
            <span className="font-semibold text-sm">{row.inputName}</span>
            {row.unitName ? (
              <span className="text-xs text-slate-500">{row.unitName}</span>
            ) : null}
          </div>
          <InputCell
            key={`${row.inputDefId}-${row.dataEntryId ?? "new"}-${row.updatedAt ?? "na"}-${row.isDataNotAvailable ? 1 : 0}`}
            row={row}
          />
        </div>
      ))}
    </div>
  );
}
