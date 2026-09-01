import DataTable from "@/components/tables/data-table";
import {
  AllSubRegions,
  CreateSubRegion,
  UpdateSubRegion,
} from "./service";
import { SubRegion } from "@/db/schema/country";

export default async function SubRegionsPage() {
  const list = await AllSubRegions();
  return (
    <DataTable<SubRegion>
      columns={["name", "un_continental_region", "is_active"]}
      data={list}
      title="Sub-Regions"
      createFormProps={{
        formAction: CreateSubRegion,
        fields: [
          { key: "name", type: "text" },
          { key: "un_continental_region", type: "text" },
          { key: "is_active", type: "checkbox" },
        ],
      }}
      updateFormProps={{
        formAction: UpdateSubRegion,
        fields: [
          { key: "name", type: "text" },
          { key: "un_continental_region", type: "text" },
          { key: "is_active", type: "checkbox" },
        ],
      }}
    />
  );
}
