import { Role, User } from "@/db/schema/auth-schema";

export default function Sidebar(props: { user: User; role: Role }) {
  if (!props.user) {
    return null;
  }

  return <div>Sidebar</div>;
}
