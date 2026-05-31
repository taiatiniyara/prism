import { authorizeApiKey } from "../service";
import { getManagedListByName } from "@/lib/legacy-dl-resolver";

export async function GET(req: Request) {
  const authorize = await authorizeApiKey(req);
  if (authorize.success === false) {
    return Response.json(authorize.message);
  }

  const list = await getManagedListByName("Feeder Type");
  return Response.json(
    list.map((item) => ({ Feeder: item.name })),
  );
}
