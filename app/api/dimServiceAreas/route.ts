import { AllServiceAreas } from "@/app/settings/service-areas/service";

export async function GET() {
  const list = await AllServiceAreas({ all: true });
  return Response.json(list);
}
