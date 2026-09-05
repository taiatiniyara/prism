"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function ReviewKpiError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Review KPI page error:", error);
  }, [error]);

  return (
    <Card className="border-danger/40">
      <CardHeader>
        <CardTitle className="text-danger">
          Something went wrong loading the Review KPI page
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {error.message ||
            "An unexpected error occurred. This may be due to a network issue or invalid filter data."}
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => reset()}
          >
            Try again
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              window.location.href = "/data-entry/review-kpi";
            }}
          >
            Reset filters and reload
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
