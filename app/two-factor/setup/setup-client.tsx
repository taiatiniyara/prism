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
import { ShieldCheck, KeyRound } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { verifyAndMarkTwoFactor } from "../actions";

type EnrolData = { secret: string; totpURI: string; backupCodes: string[] };

const parseSecret = (totpURI: string): string =>
  /[?&]secret=([^&]+)/i.exec(totpURI)?.[1] ?? "";

export default function TwoFactorSetupClient({
  redirectTo,
}: {
  redirectTo: string;
}) {
  const [enrol, setEnrol] = useState<EnrolData | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function begin() {
    setLoading(true);
    setError(null);
    // `allowPasswordless` is set on the server plugin, so magic-link admins
    // (no password) can enrol; the password field is ignored for them.
    const { data, error: enrolError } = await authClient.twoFactor.enable({
      password: "",
    });
    setLoading(false);
    if (enrolError || !data) {
      setError(
        enrolError?.message ??
          "Could not start two-factor setup. Please try again.",
      );
      return;
    }
    setEnrol({
      secret: parseSecret(data.totpURI),
      totpURI: data.totpURI,
      backupCodes: data.backupCodes ?? [],
    });
  }

  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    // Verified server-side; on first success the plugin flips twoFactorEnabled
    // and the action marks this session as passed.
    const res = await verifyAndMarkTwoFactor(code, false);
    if (res.ok) {
      window.location.href = redirectTo;
      return;
    }
    setError(res.error ?? "Verification failed.");
    setLoading(false);
    setCode("");
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-slate-50 p-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-slate-700" />
            <CardTitle>Set up two-factor authentication</CardTitle>
          </div>
          <CardDescription>
            Administrator accounts require an authenticator app. This is a
            one-time setup.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!enrol ? (
            <div className="space-y-4">
              <p className="text-sm text-slate-600">
                You&apos;ll need an authenticator app such as Google
                Authenticator, Microsoft Authenticator, or 1Password. Click
                below to generate your secret key, then add it to the app.
              </p>
              {error && (
                <p className="text-sm text-danger bg-danger/10 rounded p-2">
                  {error}
                </p>
              )}
              <Button
                onClick={begin}
                disabled={loading}
                className="w-full"
              >
                {loading ? "Preparing…" : "Begin setup"}
              </Button>
            </div>
          ) : (
            <form
              onSubmit={confirm}
              className="space-y-5"
            >
              <div className="space-y-2">
                <p className="text-sm font-medium text-slate-700">
                  1. Add this key to your authenticator app
                </p>
                <div className="flex items-center gap-2 rounded-md border bg-slate-50 p-3">
                  <KeyRound className="h-4 w-4 shrink-0 text-slate-500" />
                  <code className="break-all text-sm font-mono text-slate-800">
                    {enrol.secret}
                  </code>
                </div>
                <p className="text-xs text-slate-500">
                  Enter it as a &quot;time-based&quot; (TOTP) key, issuer
                  &quot;PRISM&quot;.
                </p>
              </div>

              {enrol.backupCodes.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-slate-700">
                    2. Save your backup codes
                  </p>
                  <p className="text-xs text-slate-500">
                    Store these somewhere safe. Each can be used once if you lose
                    your device. They are shown only now.
                  </p>
                  <div className="grid grid-cols-2 gap-2 rounded-md border bg-slate-50 p-3 font-mono text-sm">
                    {enrol.backupCodes.map((c) => (
                      <span key={c}>{c}</span>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <p className="text-sm font-medium text-slate-700">
                  3. Enter the current 6-digit code to confirm
                </p>
                <Input
                  autoFocus
                  name="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="123456"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  required
                />
              </div>

              {error && (
                <p className="text-sm text-danger bg-danger/10 rounded p-2">
                  {error}
                </p>
              )}
              <Button
                type="submit"
                disabled={loading}
                className="w-full"
              >
                {loading ? "Verifying…" : "Confirm & finish"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
