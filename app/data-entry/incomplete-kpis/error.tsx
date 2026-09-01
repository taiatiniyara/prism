"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function IncompleteKpisError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Incomplete KPIs page error:", error);
  }, [error]);

  return (
    <Card className="border-red-200">
      <CardHeader>
        <CardTitle className="text-red-700">
          Something went wrong loading incomplete KPIs
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {error.message ||
            "An unexpected error occurred."}
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
              window.location.href = "/data-entry/incomplete-kpis";
            }}
          >
            Reload
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
