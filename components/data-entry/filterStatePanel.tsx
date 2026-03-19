import { ReactNode } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface FilterStatePanelProps {
  isLoading?: boolean;
  isEmpty?: boolean;
  errorMessage?: string | null;
  emptyMessage?: string;
  children: ReactNode;
}

export function FilterStatePanel({
  isLoading,
  isEmpty,
  errorMessage,
  emptyMessage = "No data is available for the current filters.",
  children,
}: FilterStatePanelProps) {
  if (isLoading) {
    return (
      <Card>
        <CardContent className="space-y-3 p-4">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (errorMessage) {
    return (
      <Card>
        <CardContent className="p-4">
          <p className="font-medium">Unable to load data-entry content</p>
          <p className="text-muted-foreground mt-1 text-sm">{errorMessage}</p>
        </CardContent>
      </Card>
    );
  }

  if (isEmpty) {
    return (
      <Card>
        <CardContent className="text-muted-foreground p-4 text-sm">
          {emptyMessage}
        </CardContent>
      </Card>
    );
  }

  return <>{children}</>;
}
