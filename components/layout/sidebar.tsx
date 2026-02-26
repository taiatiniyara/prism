"use client";

import { Role, User } from "@/db/schema/auth-schema";

export default function Sidebar(props: { user: User; role: Role }) {
  return <div>Sidebar</div>;
}
