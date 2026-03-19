import { DataEntryInputRowView } from "@/app/data-entry/types";

import InputCell from "@/app/data-entry/enter-data/inputCell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface InputRowsProps {
  rows: DataEntryInputRowView[];
}

export default function InputRows({ rows }: InputRowsProps) {
  if (rows.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Input Rows</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground text-sm">
          No input rows are available for the selected filter combination.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid lg:grid-cols-3 gap-4 sm:grid-cols-1 md:grid-cols-2">
      {rows.map((row) => (
        <div key={row.inputDefId}>
          <div className="text-sm ml-3 font-medium">{row.inputName}</div>
          <InputCell row={row} />
        </div>
      ))}
    </div>
  );
}
