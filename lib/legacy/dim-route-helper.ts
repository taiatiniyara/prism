import { authorizeApiKey } from "@/app/api/service";
import { getManagedListByName } from "@/lib/legacy/legacy-dl-resolver";

export async function dimManagedListRoute(
  req: Request,
  listName: string,
  outputKey: string,
) {
  const auth = await authorizeApiKey(req);
  if (!auth.success) {
    return Response.json(auth.message);
  }

  const list = await getManagedListByName(listName);
  return Response.json(
    list
      .filter(
        (item) =>
          !item.name.includes("All") && !item.name.includes("Every"),
      )
      .map((item) => ({ [outputKey]: item.name })),
  );
}
