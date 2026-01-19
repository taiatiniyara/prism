import { Role, User } from "@/drizzle/schema/auth-schema";

export default function Sidebar(props: {
  user: User | null;
  role: Role | null;
}) {
  if (!props.user) {
    return null;
  }

  return <div>Sidebar</div>;
}
