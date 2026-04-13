import { getCurrentUser } from "@/lib/user.service";
import UtilityRelevanceSection from "./utilityRelevance";
import DevRelevanceSection from "./devRelevance";

type RelevanceSearchParams = {
  report_period_id?: string;
  service_area_id?: string;
};

export default async function RelevanceSettingsPage(props: {
  searchParams?: Promise<RelevanceSearchParams> | RelevanceSearchParams;
}) {
  const searchParams = await Promise.resolve(props.searchParams);
  const user = await getCurrentUser();

  if (user && user.role !== "DEV") {
    return <UtilityRelevanceSection searchParams={searchParams} />;
  }
  return <DevRelevanceSection />;
}
