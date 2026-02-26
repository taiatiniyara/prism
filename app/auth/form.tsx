"use client";

import { Input } from "@/components/ui/input";
import { registerUser, sendMagicLink } from "./service";
import SubmitBtn from "@/components/submitBtn";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LogIn, UserPlus } from "lucide-react";
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
import { FaBuilding, FaEnvelope, FaUser, FaUserPlus } from "react-icons/fa";

const rolesFilter = (roles: Role[], nonUtilityUser: boolean | string) => {
  const filters = {
    utitilityRoles: ["BLO", "DAOO", "DAOF", "DAOH", "MGR", "EXE", "CEO"],
    nonUtilityRoles: [
      "CON",
      "ALM",
      "AFM",
      "DON",
      "DASH_UTL",
      "DASH_COU",
      "DASH_REG",
      "DASH_PAC",
    ],
  };

  if (nonUtilityUser) {
    return roles.filter((role) => filters.nonUtilityRoles.includes(role.name));
  } else {
    return roles.filter((role) => filters.utitilityRoles.includes(role.name));
  }
};

export default function AuthForms(props: {
  orgs: Organisation[];
  roles: Role[];
}) {
  const [nonUtilityUser, setNonUtilityUser] = useState<CheckedState>(false);
  const [signUp, setSignUp] = useState<boolean>(false);

  return (
    <div className="w-full py-8 h-screen flex flex-col gap-4 items-center">
      <form
        action={async (formData) => {
          const email = formData.get("email") as string;
          if (signUp) {
            const firstName = formData.get("firstName") as string;
            const lastName = formData.get("lastName") as string;
            const organisation_id = formData.get("organisation_id") as string;
            const datasetsRequired = formData.get("datasetsRequired") as string;
            const dataAccessReason = formData.get("dataAccessReason") as string;
            const role_id = formData.get("role_id") as string;
            const res = await registerUser({
              dataAccessReason,
              datasetsRequired,
              email,
              firstName,
              lastName,
              organisationId: Number(organisation_id),
              roleId: Number(role_id),
            });
            if (res) {
              window.location.href = "/auth/success";
            } else {
              toast.error("Failed to register user");
            }
          } else {
            const sendLink = await sendMagicLink(email);
            if (!sendLink.success) {
              toast.error(sendLink.message);
            } else {
              window.location.href = "/auth/success";
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
              <UserPlus /> Register
            </TabsTrigger>
          </TabsList>
          <TabsContent
            className="space-y-4 px-2"
            value="Login"
          >
            <p className="text-blue-600 font-medium p-2 rounded bg-blue-50">
              If you have an existing account, please enter your email to
              receive a login link.
            </p>
            <Input
              required
              name="email"
              placeholder="Enter your email"
            />
            <SubmitBtn
              text={
                <>
                  <FaEnvelope /> Send Link
                </>
              }
            />
          </TabsContent>
          <TabsContent
            value="Register"
            className="space-y-4"
          >
            <p className="text-blue-600 bg-blue-50 p-2 rounded font-medium">
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
                {props.orgs
                  .filter((org) => {
                    if (nonUtilityUser) {
                      return org.is_utility === false;
                    } else {
                      return (
                        org.is_utility === true &&
                        org.is_active === true &&
                        !org.name.includes("All")
                      );
                    }
                  })
                  .map((org) => (
                    <SelectItem
                      key={org.id}
                      value={org.id.toString()}
                    >
                      <FaBuilding /> {org.name}
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
                    <FaUser /> {role.description}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {nonUtilityUser && (
              <>
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
              </>
            )}

            <SubmitBtn
              text={
                <>
                  <FaUserPlus /> Submit
                </>
              }
            />
          </TabsContent>
        </Tabs>
      </form>
    </div>
  );
}
