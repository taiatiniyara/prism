import DataTable from "@/components/tables/data-table";
import { KpiDefinition } from "@/db/schema/kpi";
import { getCurrentUser } from "@/lib/user.service";
import KpiFormulaBuilder from "./formulaBuilder";
import {
  CreateKpiDefinition,
  GetAllKpiDefinitions,
  GetKpiFormulaBuilderData,
  GetKpiTypeOptions,
  UpdateKpiDefinition,
} from "./service";
import UploadKpiFromExcel from "./uploadFromExcel";
import KpiLimitsEditor from "./limitsEditor";

export default async function KpiSettingsPage() {
  const currentUser = await getCurrentUser();
  const isDevRole = currentUser.role === "DEV";
  const isGlobalRole = currentUser.role === "DEV" || currentUser.role === "BMO";
  const kpiDefinitions = await GetAllKpiDefinitions();
  const data = await GetKpiFormulaBuilderData();
  const kpiTypes = await GetKpiTypeOptions();

  return (
    <div className="mx-auto w-full max-w-350 space-y-6 pb-8 sm:space-y-8">
      <section className="rounded-xl border bg-card p-4 sm:p-6">
        <div className="mb-4 flex flex-col gap-2 sm:mb-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">KPI Definitions</h2>
            <p className="text-sm text-muted-foreground">
              Create and maintain KPI metadata, ownership, and formula type.
            </p>
          </div>
          {isDevRole ? <UploadKpiFromExcel /> : null}
        </div>

        <DataTable<KpiDefinition>
          title="KPI Definitions"
          data={kpiDefinitions}
          columns={[
            "name",
            "category",
            "subcategory",
            "formula",
            "unit",
            "type",
          ]}
          createFormProps={{
            formAction: CreateKpiDefinition,
            fields: [
              { key: "name", type: "text" },
              { key: "description", type: "textarea" },
              {
                key: "type",
                type: "select",
                disabled: !isGlobalRole,
                selectList: kpiTypes,
              },
            ],
          }}
          updateFormProps={{
            formAction: UpdateKpiDefinition,
            fields: [
              { key: "name", type: "text" },
              { key: "description", type: "textarea" },
              {
                key: "type",
                type: "select",
                disabled: !isGlobalRole,
                selectList: kpiTypes,
              },
            ],
          }}
        />
      </section>

      <KpiLimitsEditor
        kpis={kpiDefinitions}
        isDevRole={isDevRole}
      />

      <section className="rounded-xl border bg-card p-4 sm:p-6">
        <p className="mb-4 text-sm text-muted-foreground">
          Choose a KPI, select input variables, and build the formula to be used
          in future KPI calculations.
        </p>
        <KpiFormulaBuilder
          kpis={data.kpis}
          inputs={data.inputs}
          energyProviderOptions={data.energyProviderOptions}
          energyTypeOptions={data.energyTypeOptions}
          energySourceOptions={data.energySourceOptions}
          previewContextLabel={data.previewContextLabel}
        />
      </section>
    </div>
  );
}
