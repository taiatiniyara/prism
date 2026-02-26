import { Role } from "@/db/schema/auth-schema";

const prismOneURL = "https://prismdashboard.org/api/migration";

export async function retrieveRoles() {
  const call = await fetch(prismOneURL + "/roles", {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });
  const list: Role[] = await call.json();
  return list;
}

export async function retrieveUtilityData() {
  const call = await fetch(prismOneURL + "/organisation", {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });
  const list = await call.json();
  console.log(list.organisations);
  return list;
}
