import DataTable from "@/components/tables/data-table";
import { KpiDefinition } from "@/db/schema/kpi";
import KpiFormulaBuilder from "./formulaBuilder";
import {
  CreateKpiDefinition,
  GetAllKpiDefinitions,
  GetKpiFormulaBuilderData,
  GetKpiTypeOptions,
  UpdateKpiDefinition,
} from "./service";
import UploadKpiFromExcel from "./uploadFromExcel";

export default async function KpiSettingsPage() {
  const kpiDefinitions = await GetAllKpiDefinitions();
  const data = await GetKpiFormulaBuilderData();
  const kpiTypes = await GetKpiTypeOptions();

  return (
    <div>
      <UploadKpiFromExcel />
      <DataTable<KpiDefinition>
        title="KPI Definitions"
        data={kpiDefinitions}
        columns={[
          "id",
          "name",
          "description",
          "type",
          "limit_lower",
          "limit_upper",
          "formula",
        ]}
        createFormProps={{
          formAction: CreateKpiDefinition,
          fields: [
            { key: "name", type: "text" },
            { key: "description", type: "textarea" },
            {
              key: "type_id",
              type: "select",
              selectList: kpiTypes,
            },
            { key: "limit_lower", type: "text" },
            { key: "limit_upper", type: "text" },
          ],
        }}
        updateFormProps={{
          formAction: UpdateKpiDefinition,
          fields: [
            { key: "name", type: "text" },
            { key: "description", type: "textarea" },
            {
              key: "type_id",
              type: "select",
              selectList: kpiTypes,
            },
            { key: "limit_lower", type: "text" },
            { key: "limit_upper", type: "text" },
          ],
        }}
      />

      <p className="text-muted-foreground text-sm">
        Choose a KPI, select input variables, and build the formula to be used
        in future KPI calculations.
      </p>
      <KpiFormulaBuilder
        kpis={data.kpis}
        inputs={data.inputs}
        energyProviderOptions={data.energyProviderOptions}
        energyTypeOptions={data.energyTypeOptions}
        energySourceOptions={data.energySourceOptions}
      />
    </div>
  );
}
