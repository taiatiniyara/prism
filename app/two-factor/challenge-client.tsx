"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ShieldCheck } from "lucide-react";
import { verifyAndMarkTwoFactor } from "./actions";

export default function TwoFactorChallenge({
  redirectTo,
}: {
  redirectTo: string;
}) {
  const [code, setCode] = useState("");
  const [useBackup, setUseBackup] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await verifyAndMarkTwoFactor(code, useBackup);
    if (res.ok) {
      // Full navigation so the proxy re-evaluates with the now-verified session.
      window.location.href = redirectTo;
      return;
    }
    setError(res.error ?? "Verification failed.");
    setLoading(false);
    setCode("");
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-slate-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-slate-700" />
            <CardTitle>Two-factor verification</CardTitle>
          </div>
          <CardDescription>
            {useBackup
              ? "Enter one of your saved backup codes to continue."
              : "Enter the 6-digit code from your authenticator app to continue."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={handleSubmit}
            className="space-y-4"
          >
            <Input
              autoFocus
              name="code"
              inputMode={useBackup ? "text" : "numeric"}
              autoComplete="one-time-code"
              placeholder={useBackup ? "Backup code" : "123456"}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
            />
            {error && (
              <p className="text-sm text-danger bg-danger/10 rounded p-2">
                {error}
              </p>
            )}
            <Button
              type="submit"
              className="w-full"
              disabled={loading}
            >
              {loading ? "Verifying…" : "Verify"}
            </Button>
            <button
              type="button"
              className="w-full text-sm text-slate-500 hover:text-slate-800 underline"
              onClick={() => {
                setUseBackup((v) => !v);
                setError(null);
                setCode("");
              }}
            >
              {useBackup
                ? "Use authenticator code instead"
                : "Use a backup code instead"}
            </button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
