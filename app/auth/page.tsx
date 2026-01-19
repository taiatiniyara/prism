"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Mail } from "lucide-react";
import { sendMagicLink } from "./service";

export default function SignInPage() {
  return (
    <div className="w-full h-screen flex justify-center items-center">
      <form
        action={async (formData) => {
          const email = formData.get("email") as string;

          await sendMagicLink(email);
        }}
        className="space-y-4 bg-white border rounded-xl shadow-lg p-6"
      >
        <p>
          <b className="text-xl">Sign In</b>
          <br />
          <span>Please enter your email to receive a sign-in link.</span>
        </p>
        <Input
          name="email"
          placeholder="Enter your email"
        />

        <Button>
          <Mail /> Send link
        </Button>
      </form>
    </div>
  );
}
