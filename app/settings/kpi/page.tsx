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
import KpiLimitsEditor from "./limitsEditor";
import KpiTargetsEditor from "./targetsEditor";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default async function KpiSettingsPage() {
  const currentUser = await getCurrentUser();
  const isDevRole = currentUser.role === "DEV";
  const isGlobalRole = currentUser.role === "DEV" || currentUser.role === "BMO";
  const canEditTargets = !isGlobalRole && currentUser.org_id != null;
  const definitionsTitle = isDevRole ? "Definitions" : "Custom KPIs";
  const kpiDefinitions = await GetAllKpiDefinitions();
  const data = await GetKpiFormulaBuilderData();
  const kpiTypes = await GetKpiTypeOptions();

  return (
    <div className="mx-auto w-full max-w-350 space-y-6 pb-8 sm:space-y-8">
      <Tabs
        defaultValue="definitions"
        className="space-y-4"
      >
        <TabsList className="h-auto flex-wrap justify-start gap-2 p-1">
          <TabsTrigger value="definitions">{definitionsTitle}</TabsTrigger>
          <TabsTrigger value="limits">Limits</TabsTrigger>
          <TabsTrigger value="targets">Targets</TabsTrigger>
          <TabsTrigger value="formula-builder">Formula Builder</TabsTrigger>
        </TabsList>

        <TabsContent value="definitions">
          <section className="rounded-xl border bg-card p-4 sm:p-6">
            <DataTable<KpiDefinition>
              title={definitionsTitle}
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
        </TabsContent>

        <TabsContent value="limits">
          <KpiLimitsEditor
            kpis={kpiDefinitions}
            isDevRole={isDevRole}
          />
        </TabsContent>

        <TabsContent value="targets">
          <KpiTargetsEditor
            kpis={data.kpis}
            utilityId={currentUser.org_id}
            canEditTargets={canEditTargets}
          />
        </TabsContent>

        <TabsContent value="formula-builder">
          <section className="rounded-xl border bg-card p-4 sm:p-6">
            <p className="mb-4 text-sm text-muted-foreground">
              Choose a KPI, select input variables, and build the formula to be
              used in future KPI calculations.
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
        </TabsContent>
      </Tabs>
    </div>
  );
}
