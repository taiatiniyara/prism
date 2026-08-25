import DataTable from "@/components/tables/data-table";
import {
  CreateCountryContextData,
  GetCountryContext,
} from "./service";
import { AllCountries } from "../countries/service";

export default async function CountryContextPage() {
  const list = await GetCountryContext();
  const countries = await AllCountries();

  return (
    <DataTable<(typeof list)[number]>
      columns={[
        "country_name",
        "measure_name",
        "value",
        "source_date",
        "source_doc",
        "updated_by",
      ]}
      data={list}
      title="Country Context"
      createFormProps={{
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        formAction: CreateCountryContextData as any,
        fields: [
          {
            key: "country_id",
            type: "select",
            selectList: countries.map((c) => ({
              value: c.id,
              label: c.name,
            })),
          },
          { key: "measure_def_id", type: "number" },
          { key: "period_year", type: "number" },
          { key: "value", type: "text" },
          { key: "source_date", type: "date" },
          { key: "source_doc", type: "text" },
          { key: "source_url", type: "text" },
        ],
      }}
    />
  );
}
