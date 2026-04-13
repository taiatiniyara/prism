import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  GetCustomKpiRelevance,
  GetTransmissionRelevance,
  GetUtilityTariffRelevance,
  SetCustomKpiRelevance,
  SetTransmissionDataLabelRelevance,
  SetUtilityTariffDataLabelRelevance,
} from "./service";
import TariffRelevanceTable from "./tariffRelevanceTable";
import RelevanceFilters from "./relevanceFilters";
import TransmissionRelevanceTable from "./transmissionRelevanceTable";
import CustomKpiRelevanceTable from "./customKpiRelevanceTable";

type UtilityRelevanceSearchParams = {
  report_period_id?: string;
  service_area_id?: string;
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

  const [tariffRelevance, transmissionRelevance, customKpiRelevance] =
    await Promise.all([
      GetUtilityTariffRelevance({
        reportPeriodId,
        serviceAreaId,
      }),
      GetTransmissionRelevance({
        reportPeriodId,
        serviceAreaId,
      }),
      GetCustomKpiRelevance(),
    ]);

  return (
    <div className="space-y-5">
      <Tabs defaultValue="tariff">
        <TabsList>
          <TabsTrigger value="tariff">Tariff</TabsTrigger>
          <TabsTrigger value="transmission">Transmission</TabsTrigger>
          <TabsTrigger value="custom-kpi-relevance">
            Custom KPI Relevance
          </TabsTrigger>
        </TabsList>
        <TabsContent value="tariff">
          <div className="space-y-5 rounded-lg border p-5 sm:p-6">
            <RelevanceFilters
              reportPeriods={tariffRelevance.options.reportPeriods}
              serviceAreas={tariffRelevance.options.serviceAreas}
              selectedReportPeriodId={tariffRelevance.filters.reportPeriodId}
              selectedServiceAreaId={tariffRelevance.filters.serviceAreaId}
            />

            {tariffRelevance.rows.length > 0 &&
            tariffRelevance.customerTypes.length > 0 &&
            tariffRelevance.filters.reportPeriodId != null &&
            tariffRelevance.filters.serviceAreaId != null ? (
              <TariffRelevanceTable
                key={`${tariffRelevance.filters.reportPeriodId}-${tariffRelevance.filters.serviceAreaId}`}
                rows={tariffRelevance.rows}
                customerTypes={tariffRelevance.customerTypes}
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
