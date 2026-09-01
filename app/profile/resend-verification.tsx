"use client";

import { useState, useTransition } from "react";
import { resendVerificationEmail } from "./actions";

export function ResendVerificationButton() {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{
    text: string;
    ok: boolean;
  } | null>(null);

  const handleResend = () => {
    setMessage(null);
    startTransition(async () => {
      const result = await resendVerificationEmail();
      setMessage({ text: result.message, ok: result.success });
    });
  };

  return (
    <div className="space-y-2">
      <button
        onClick={handleResend}
        disabled={isPending}
        className="bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium px-4 py-2 rounded-md disabled:opacity-50 transition-colors"
      >
        {isPending ? "Sending..." : "Resend verification email"}
      </button>
      {message && (
        <p
          className={`text-sm ${
            message.ok ? "text-green-700" : "text-red-600"
          }`}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
