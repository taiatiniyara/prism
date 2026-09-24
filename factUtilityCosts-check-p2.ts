import "dotenv/config";
import * as fs from "fs";
import { GET } from "./app/api/factUtilityCosts/route";

async function main() {
  const key = process.env.API_KEY;
  if (!key) {
    console.error("no API_KEY in .env");
    process.exit(1);
  }
  const req = new Request("http://p2/api/factUtilityCosts", {
    headers: { Authorization: key },
  });
  const res = await GET(req);
  if (res.status !== 200) {
    console.error("p2 status:", res.status, await res.text());
    process.exit(1);
  }
  const data = await res.json();
  fs.writeFileSync(
    "factUtilityCosts-p2.json",
    JSON.stringify(data, null, 2),
  );
  console.log(
    "p2 rows:",
    Array.isArray(data) ? data.length : JSON.stringify(data).length,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});