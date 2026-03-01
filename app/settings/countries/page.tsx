import DataTable from "@/components/tables/data-table";
import { AllCountries, AllSubRegions, CreateCountry } from "./service";
import { Country } from "@/db/schema/country";

export default async function CountriesPage() {
  const list = await AllCountries();
  const subRegions = await AllSubRegions();
  return (
    <DataTable<Country>
      columns={["name", "sub_region", "iso_code_alpha3"]}
      data={list}
      title="Countries"
      createFormProps={{
        formAction: CreateCountry,
        fields: [
          {
            key: "name",
            type: "text",
          },
          {
            key: "sub_region_id",
            type: "select",
            selectList: subRegions.map((item) => ({
              value: item.id,
              label: item.name,
            })),
          },
          {
            key: "iso_code_alpha3",
            type: "text",
          },
          {
            key: "iso_code_alpha2",
            type: "text",
          },
          {
            key: "dial_code",
            type: "text",
          },
          {
            key: "is_adb_member",
            type: "checkbox",
          },
        ],
      }}
    />
  );
}
