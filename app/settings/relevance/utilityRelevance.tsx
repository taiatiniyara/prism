import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  GetCustomKpiRelevance,
  GetTransmissionRelevance,
  GetUtilityGenerationRelevance,
  GetUtilityTariffRelevance,
  SetCustomKpiRelevance,
  SetTransmissionDataLabelRelevance,
  SetUtilityGenerationDataLabelRelevance,
  SetUtilityTariffDataLabelRelevance,
} from "./service";
import TariffRelevanceTable from "./tariffRelevanceTable";
import RelevanceFilters from "./relevanceFilters";
import TransmissionRelevanceTable from "./transmissionRelevanceTable";
import CustomKpiRelevanceTable from "./customKpiRelevanceTable";
import GenerationRelevanceTable from "./generationRelevanceTable";

type UtilityRelevanceSearchParams = {
  report_period_id?: string;
  service_area_id?: string;
  tariff_customer_type_ids?: string;
};

const parseId = (value: string | undefined): number | null => {
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

export default async function UtilityRelevanceSection(props: {
  searchParams?: UtilityRelevanceSearchParams;
}) {
  const reportPeriodId = parseId(props.searchParams?.report_period_id);
  const serviceAreaId = parseId(props.searchParams?.service_area_id);

  const [
    tariffRelevance,
    transmissionRelevance,
    generationRelevance,
    customKpiRelevance,
  ] = await Promise.all([
    GetUtilityTariffRelevance({
      reportPeriodId,
      serviceAreaId,
    }),
    GetTransmissionRelevance({
      reportPeriodId,
      serviceAreaId,
    }),
    GetUtilityGenerationRelevance({
      reportPeriodId,
      serviceAreaId,
    }),
    GetCustomKpiRelevance(),
  ]);

  const requestedTariffCustomerTypeIds = (
    props.searchParams?.tariff_customer_type_ids ?? ""
  )
    .split(",")
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value) && value > 0);

  const availableTariffCustomerTypeIds = new Set(
    tariffRelevance.customerTypes.map((customerType) => customerType.id),
  );

  const selectedTariffCustomerTypeIds =
    requestedTariffCustomerTypeIds.length > 0
      ? requestedTariffCustomerTypeIds.filter((id) =>
          availableTariffCustomerTypeIds.has(id),
        )
      : tariffRelevance.customerTypes.map((customerType) => customerType.id);

  return (
    <div className="space-y-5">
      <Tabs defaultValue="generation">
        <TabsList>
          <TabsTrigger value="generation">Energy Resources</TabsTrigger>
          <TabsTrigger value="transmission">Transmission</TabsTrigger>
          <TabsTrigger value="tariff">Tariff</TabsTrigger>
          <TabsTrigger value="custom-kpi-relevance">
            Shared Custom KPIs
          </TabsTrigger>
        </TabsList>
        <TabsContent value="tariff">
          <div className="space-y-5 rounded-lg border p-5 sm:p-6">
            <RelevanceFilters
              reportPeriods={tariffRelevance.options.reportPeriods}
              serviceAreas={tariffRelevance.options.serviceAreas}
              selectedReportPeriodId={tariffRelevance.filters.reportPeriodId}
              selectedServiceAreaId={tariffRelevance.filters.serviceAreaId}
              customerTypes={tariffRelevance.customerTypes}
              selectedCustomerTypeIds={selectedTariffCustomerTypeIds}
              tariffRows={tariffRelevance.rows}
              onToggleTariffRelevance={SetUtilityTariffDataLabelRelevance}
            />

            {tariffRelevance.rows.length > 0 &&
            tariffRelevance.customerTypes.length > 0 &&
            tariffRelevance.filters.reportPeriodId != null &&
            tariffRelevance.filters.serviceAreaId != null ? (
              <TariffRelevanceTable
                key={`${tariffRelevance.filters.reportPeriodId}-${tariffRelevance.filters.serviceAreaId}`}
                rows={tariffRelevance.rows}
                customerTypes={tariffRelevance.customerTypes}
                selectedCustomerTypeIds={selectedTariffCustomerTypeIds}
                reportPeriodId={tariffRelevance.filters.reportPeriodId}
                serviceAreaId={tariffRelevance.filters.serviceAreaId}
                onToggleRelevance={SetUtilityTariffDataLabelRelevance}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                No tariff relevance data is available for the selected filters.
              </p>
            )}
          </div>
        </TabsContent>
        <TabsContent value="transmission">
          <div className="space-y-5 rounded-lg border p-5 sm:p-6">
            <RelevanceFilters
              reportPeriods={transmissionRelevance.options.reportPeriods}
              serviceAreas={transmissionRelevance.options.serviceAreas}
              selectedReportPeriodId={
                transmissionRelevance.filters.reportPeriodId
              }
              selectedServiceAreaId={
                transmissionRelevance.filters.serviceAreaId
              }
            />

            {transmissionRelevance.items.length > 0 &&
            transmissionRelevance.filters.reportPeriodId != null &&
            transmissionRelevance.filters.serviceAreaId != null ? (
              <TransmissionRelevanceTable
                key={`${transmissionRelevance.filters.reportPeriodId}-${transmissionRelevance.filters.serviceAreaId}`}
                items={transmissionRelevance.items}
                reportPeriodId={transmissionRelevance.filters.reportPeriodId}
                serviceAreaId={transmissionRelevance.filters.serviceAreaId}
                onToggleRelevance={SetTransmissionDataLabelRelevance}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                No transmission relevance data is available for the selected
                filters.
              </p>
            )}

            <span className="text-xs text-muted-foreground">
              * Transmission refers to any lines with voltages 34kV and above.
            </span>
          </div>
        </TabsContent>
        <TabsContent value="generation">
          <div className="space-y-5 rounded-lg border p-5 sm:p-6">
            <RelevanceFilters
              reportPeriods={generationRelevance.options.reportPeriods}
              serviceAreas={generationRelevance.options.serviceAreas}
              selectedReportPeriodId={
                generationRelevance.filters.reportPeriodId
              }
              selectedServiceAreaId={generationRelevance.filters.serviceAreaId}
            />

            {generationRelevance.rows.length > 0 &&
            generationRelevance.energyProviders.length > 0 &&
            generationRelevance.filters.reportPeriodId != null &&
            generationRelevance.filters.serviceAreaId != null ? (
              <GenerationRelevanceTable
                key={`${generationRelevance.filters.reportPeriodId}-${generationRelevance.filters.serviceAreaId}`}
                rows={generationRelevance.rows}
                reportPeriodId={generationRelevance.filters.reportPeriodId}
                serviceAreaId={generationRelevance.filters.serviceAreaId}
                onToggleRelevance={SetUtilityGenerationDataLabelRelevance}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                No generation relevance data is available for the selected
                filters.
              </p>
            )}
          </div>
        </TabsContent>
        <TabsContent value="custom-kpi-relevance">
          <div className="space-y-5 rounded-lg border p-5 sm:p-6">
            {customKpiRelevance.length > 0 ? (
              <CustomKpiRelevanceTable
                items={customKpiRelevance}
                onToggleRelevance={SetCustomKpiRelevance}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                No custom KPI definitions are available.
              </p>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
