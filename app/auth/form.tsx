"use client";

import { Input } from "@/components/ui/input";
import { registerUser, sendMagicLink } from "./service";
import SubmitBtn from "@/components/submitBtn";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Home, LogIn, User } from "lucide-react";
import { Organisation } from "@/db/schema/utility";
import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { CheckedState } from "@radix-ui/react-checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Role } from "@/db/schema/auth-schema";

const rolesFilter = (roles: Role[], nonUtilityUser: boolean | string) => {
  const filters = {
    utitilityRoles: ["BMO", "BLO", "DAOO", "DAOF", "DAOH", "MGR", "EXE"],
    nonUtilityRoles: ["CON", "ALM", "AFM"],
  };

  if (nonUtilityUser) {
    return roles.filter((role) => filters.nonUtilityRoles.includes(role.name));
  }
  return roles.filter((role) => !filters.utitilityRoles.includes(role.name));
};

export default function AuthForms(props: {
  orgs: Organisation[];
  roles: Role[];
}) {
  const [nonUtilityUser, setNonUtilityUser] = useState<CheckedState>(false);
  const [signUp, setSignUp] = useState<boolean>(false);

  return (
    <div className="w-full h-screen flex flex-col gap-4 items-center">
      <form
        action={async (formData) => {
          const email = formData.get("email") as string;
          if (signUp) {
            const firstName = formData.get("firstName") as string;
            const lastName = formData.get("lastName") as string;
            const organisation_id = formData.get("organisation_id") as string;
            const datasetsRequired = formData.get("datasetsRequired") as string;
            const dataAccessReason = formData.get("dataAccessReason") as string;
            await registerUser({
              dataAccessReason,
              datasetsRequired,
              email,
              firstName,
              lastName,
              organisationId: Number(organisation_id),
            });
            toast.success("User registered successfully");
          } else {
            const sendLink = await sendMagicLink(email);
            if (!sendLink.success) {
              toast.error(sendLink.message);
            } else {
              toast.success("Magic link sent successfully");
            }
          }
        }}
        className="space-y-4 bg-white"
      >
        <Tabs
          defaultValue="Login"
          className="w-[500px]"
        >
          <TabsList>
            <TabsTrigger
              onClick={() => setSignUp(false)}
              value="Login"
            >
              <LogIn /> Login
            </TabsTrigger>
            <TabsTrigger
              onClick={() => setSignUp(true)}
              value="Register"
            >
              <User /> Register
            </TabsTrigger>
          </TabsList>
          <TabsContent
            className="space-y-4 px-2"
            value="Login"
          >
            <p>
              If you have an existing account, please enter your email to
              receive a sign-in link.
            </p>
            <Input
              required
              name="email"
              placeholder="Enter your email"
            />
            <SubmitBtn text="Send Magic Link" />
          </TabsContent>
          <TabsContent
            value="Register"
            className="space-y-4"
          >
            <p>
              Fill in the form below to register an account. Note that your
              account will be subject to approval by the PRISM team.
            </p>
            <div className="flex gap-2">
              <Input
                required
                name="firstName"
                placeholder="First Name"
              />
              <Input
                required
                name="lastName"
                placeholder="Last Name"
              />
            </div>
            <Input
              required
              name="email"
              placeholder="Enter your email"
            />

            <Label className="border p-3 rounded-md shadow-sm bg-white hover:bg-gray-100 cursor-pointer">
              <Checkbox
                checked={nonUtilityUser}
                onCheckedChange={setNonUtilityUser}
              />
              I am a non-utility user
            </Label>

            <Select name="organisation_id">
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Organisation" />
              </SelectTrigger>
              <SelectContent>
                {props.orgs.map((org) => (
                  <SelectItem
                    key={org.id}
                    value={org.id.toString()}
                  >
                    {org.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select name="role_id">
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Role" />
              </SelectTrigger>
              <SelectContent>
                {rolesFilter(props.roles, nonUtilityUser).map((role) => (
                  <SelectItem
                    key={role.id}
                    value={role.id.toString()}
                  >
                    {role.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Textarea
              required
              name="datasetsRequired"
              placeholder="Write down the datasets you require"
            />

            <Textarea
              required
              name="dataAccessReason"
              placeholder="State the reason(s) for accessing data"
            />

            <SubmitBtn text="Register" />
          </TabsContent>
        </Tabs>
      </form>

      <a
        href="/"
        className="flex items-center hover:text-blue-400 gap-1 cursor-pointer underline font-medium text-sm"
      >
        <Home size={16} /> Home
      </a>
    </div>
  );
}
