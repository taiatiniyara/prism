import DataTable from "@/components/tables/data-table";
import { KpiDefinition } from "@/db/schema/kpi";
import { getCurrentUser } from "@/lib/user.service";
import {
  getCustomKpiPageViewModel,
  listCustomKpiProposalReferenceOptions,
  listCustomKpiReviewQueue,
} from "@/app/settings/kpi/custom-kpi/service";
import { CustomKpiRequestDialog } from "@/components/data-entry/custom-kpi-request-dialog";
import { CustomKpiRequestStatusBadge } from "@/components/data-entry/custom-kpi-request-status-badge";
import { CustomKpiReviewActions } from "@/components/data-entry/custom-kpi-review-actions";
import KpiFormulaBuilder from "./formulaBuilder";
import {
  CreateKpiDefinition,
  GetAllKpiDefinitions,
  GetKpiFormulaBuilderData,
  GetKpiTypeOptions,
  UpdateKpiDefinition,
} from "./service";
import { listCustomKpiApprovalTaxonomyOptions } from "@/app/data-entry/review-kpi/service";
import KpiLimitsEditor from "./limitsEditor";
import KpiTargetsEditor from "./targetsEditor";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default async function KpiSettingsPage() {
  const currentUser = await getCurrentUser();
  const isDevRole = currentUser.role === "DEV";
  const isBloRole = currentUser.role === "BLO";
  const isGlobalRole = currentUser.role === "DEV" || currentUser.role === "BMO";
  const canEditTargets = !isGlobalRole && currentUser.org_id != null;
  const definitionsTitle = isDevRole ? "Definitions" : "Custom KPI Requests";
  const showCustomKpiReviewView = isDevRole;
  const showCustomKpiRequestsView = isBloRole;
  const kpiDefinitions = await GetAllKpiDefinitions();
  const data = await GetKpiFormulaBuilderData();
  const kpiTypes = await GetKpiTypeOptions();
  const customKpiViewModel = showCustomKpiRequestsView
    ? await getCustomKpiPageViewModel(currentUser.id)
    : null;
  const customKpiQueue = showCustomKpiReviewView
    ? await listCustomKpiReviewQueue().catch(() => null)
    : null;
  const customKpiProposalReferenceOptions = showCustomKpiReviewView
    ? await listCustomKpiProposalReferenceOptions().catch(() => ({
        availableInputDefinitions: [],
        availableUnits: [],
        availableDataTypes: [],
      }))
    : {
        availableInputDefinitions: [],
        availableUnits: [],
        availableDataTypes: [],
      };
  const customKpiApprovalOptions = showCustomKpiReviewView
    ? await listCustomKpiApprovalTaxonomyOptions().catch(() => ({
        categories: [],
        subcategories: [],
      }))
    : { categories: [], subcategories: [] };
  const customKpiWorkflowSection = (
    <section className="space-y-4 rounded-xl border bg-card p-4 sm:p-6">
      {showCustomKpiRequestsView && customKpiViewModel ? (
        <>
          <CustomKpiRequestDialog
            inputOptions={customKpiViewModel.availableInputDefinitions}
            unitOptions={customKpiViewModel.availableUnits}
          />

          {customKpiViewModel.requests.length === 0 ? (
            <div className="rounded-md border bg-muted/20 p-3 text-sm text-muted-foreground">
              No custom KPI requests submitted yet.
            </div>
          ) : (
            <div className="space-y-2">
              {customKpiViewModel.requests.map((request) => (
                <details
                  key={request.id}
                  className="group rounded-md border bg-background p-3 text-sm"
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                    <div>
                      <div className="font-medium">{request.title}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        Submitted {request.created_at.toLocaleString()}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground group-open:hidden">
                        Expand
                      </span>
                      <span className="hidden text-xs text-muted-foreground group-open:inline">
                        Collapse
                      </span>
                      <CustomKpiRequestStatusBadge status={request.status} />
                    </div>
                  </summary>

                  <div className="mt-3 border-t pt-3 text-xs text-muted-foreground sm:text-sm">
                    <div>
                      Last updated {request.updated_at.toLocaleString()}
                    </div>
                    <div className="mt-1">
                      Selected inputs:{" "}
                      {request.selected_input_definition_ids.length}
                    </div>

                    <div className="mt-3 space-y-3 text-foreground">
                      <div>
                        <p className="mb-1 text-xs font-medium text-muted-foreground">
                          Formula expression
                        </p>
                        <div className="whitespace-pre-wrap rounded border bg-muted/20 p-2 font-mono text-[11px] sm:text-xs">
                          {request.formula_expression}
                        </div>
                      </div>

                      <div>
                        <p className="mb-1 text-xs font-medium text-muted-foreground">
                          Description
                        </p>
                        <div className="whitespace-pre-wrap rounded border bg-muted/20 p-2 text-xs sm:text-sm">
                          {request.description || "-"}
                        </div>
                      </div>

                      <div>
                        <p className="mb-1 text-xs font-medium text-muted-foreground">
                          Selected input details
                        </p>
                        {request.selectedInputs.length === 0 ? (
                          <div className="rounded border bg-muted/20 p-2 text-xs sm:text-sm">
                            -
                          </div>
                        ) : (
                          <ul className="list-disc space-y-1 rounded border bg-muted/20 p-3 pl-7 text-xs sm:text-sm">
                            {request.selectedInputs.map((selectedInput) => (
                              <li key={selectedInput.id}>
                                {selectedInput.name}
                                {selectedInput.variableName
                                  ? ` [${selectedInput.variableName}]`
                                  : ""}
                                {selectedInput.unit
                                  ? ` (${selectedInput.unit})`
                                  : ""}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  </div>
                </details>
              ))}
            </div>
          )}
        </>
      ) : null}

      {showCustomKpiReviewView ? (
        <>
          <div className="rounded-md border bg-muted/20 p-3 text-xs text-muted-foreground sm:text-sm">
            DEV review queue
            {customKpiQueue ? ` (${customKpiQueue.length})` : ""}
          </div>

          {customKpiQueue == null ? (
            <p className="mt-2 text-xs sm:text-sm">
              Unable to load custom KPI review queue.
            </p>
          ) : null}

          {customKpiQueue?.length === 0 ? (
            <p className="mt-2 text-xs sm:text-sm">
              No custom KPI requests are waiting in the queue.
            </p>
          ) : null}

          {(customKpiQueue?.length ?? 0) > 0 ? (
            <div className="mt-3 space-y-3">
              {customKpiQueue!.map((item) => (
                <details
                  key={item.id}
                  className="group rounded-lg border bg-background p-5 shadow-sm sm:p-6"
                >
                  <summary className="flex cursor-pointer list-none items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        Custom KPI request
                      </p>
                      <h3 className="text-sm font-semibold sm:text-base">
                        {item.title}
                      </h3>
                      <p className="text-xs text-muted-foreground sm:text-sm">
                        {item.submitterOrganisationAcronym || "-"} •{" "}
                        {item.created_at.toLocaleString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground group-open:hidden">
                        Expand
                      </span>
                      <span className="hidden text-xs text-muted-foreground group-open:inline">
                        Collapse
                      </span>
                      <CustomKpiRequestStatusBadge status={item.status} />
                    </div>
                  </summary>

                  <div className="mb-4 mt-4 border-b pb-3" />

                  <div className="mb-4 rounded-md border bg-muted/10 p-3">
                    <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Submitter details
                    </h4>
                    <dl className="grid gap-2 text-xs sm:grid-cols-2 sm:text-sm">
                      <div>
                        <dt className="font-medium text-muted-foreground">
                          Name
                        </dt>
                        <dd>{item.submitterName || "Unknown user"}</dd>
                      </div>
                      <div>
                        <dt className="font-medium text-muted-foreground">
                          Email
                        </dt>
                        <dd>{item.submitterEmail || "-"}</dd>
                      </div>
                      <div>
                        <dt className="font-medium text-muted-foreground">
                          Organisation
                        </dt>
                        <dd>{item.submitterOrganisationAcronym || "-"}</dd>
                      </div>
                      <div>
                        <dt className="font-medium text-muted-foreground">
                          Request date
                        </dt>
                        <dd>{item.created_at.toLocaleString()}</dd>
                      </div>
                    </dl>
                  </div>

                  <div className="mb-4 space-y-3">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Request content
                    </h4>

                    <div>
                      <p className="mb-1 text-xs font-medium text-muted-foreground">
                        Formula expression
                      </p>
                      <div className="whitespace-pre-wrap wrap-break-word rounded border bg-muted/20 p-2 font-mono text-[11px] sm:text-xs">
                        {item.formula_expression}
                      </div>
                    </div>

                    <div>
                      <p className="mb-1 text-xs font-medium text-muted-foreground">
                        Description
                      </p>
                      <div className="whitespace-pre-wrap wrap-break-word rounded border bg-muted/20 p-2 text-xs sm:text-sm">
                        {item.description || "-"}
                      </div>
                    </div>

                    <div>
                      <p className="mb-1 text-xs font-medium text-muted-foreground">
                        Selected inputs ({item.selectedInputs.length})
                      </p>
                      {item.selectedInputs.length === 0 ? (
                        <div className="rounded border bg-muted/20 p-2 text-xs sm:text-sm">
                          -
                        </div>
                      ) : (
                        <ul className="list-disc space-y-1 rounded border bg-muted/20 p-3 pl-7 text-xs sm:text-sm">
                          {item.selectedInputs.map((selectedInput) => (
                            <li key={selectedInput.id}>
                              {selectedInput.name}
                              {selectedInput.unit
                                ? ` (${selectedInput.unit})`
                                : ""}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div>
                      <p className="mb-1 text-xs font-medium text-muted-foreground">
                        Proposed units ({item.proposed_units.length})
                      </p>
                      {item.proposed_units.length === 0 ? (
                        <div className="rounded border bg-muted/20 p-2 text-xs sm:text-sm">
                          -
                        </div>
                      ) : (
                        <ul className="list-disc space-y-1 rounded border bg-muted/20 p-3 pl-7 text-xs sm:text-sm">
                          {item.proposed_units.map((proposedUnit, index) => (
                            <li key={`${item.id}-proposed-unit-${index}`}>
                              {proposedUnit.name}
                              {proposedUnit.description
                                ? ` - ${proposedUnit.description}`
                                : ""}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div>
                      <p className="mb-1 text-xs font-medium text-muted-foreground">
                        Proposed inputs ({item.proposed_inputs.length})
                      </p>
                      {item.proposed_inputs.length === 0 ? (
                        <div className="rounded border bg-muted/20 p-2 text-xs sm:text-sm">
                          -
                        </div>
                      ) : (
                        <ul className="list-disc space-y-1 rounded border bg-muted/20 p-3 pl-7 text-xs sm:text-sm">
                          {item.proposed_inputs.map((proposedInput, index) => (
                            <li key={`${item.id}-proposed-input-${index}`}>
                              {proposedInput.name}
                              {proposedInput.unit
                                ? ` (${proposedInput.unit})`
                                : ""}
                              {proposedInput.dataType
                                ? ` [${proposedInput.dataType}]`
                                : ""}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>

                  <div className="border-t pt-4">
                    <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Review actions
                    </h4>
                    <CustomKpiReviewActions
                      requestId={item.id}
                      latestDecisionId={item.latestDecisionId}
                      canPromote={
                        item.status === "APPROVED" &&
                        item.visibility_scope === "SUBMITTER_ONLY"
                      }
                      categoryOptions={customKpiApprovalOptions.categories}
                      subcategoryOptions={
                        customKpiApprovalOptions.subcategories
                      }
                      existingInputOptions={
                        customKpiProposalReferenceOptions.availableInputDefinitions
                      }
                      existingUnitOptions={
                        customKpiProposalReferenceOptions.availableUnits
                      }
                      dataTypeOptions={
                        customKpiProposalReferenceOptions.availableDataTypes
                      }
                      proposedUnits={item.proposed_units}
                      proposedInputs={item.proposed_inputs}
                    />
                  </div>
                </details>
              ))}
            </div>
          ) : null}
        </>
      ) : null}

      {!showCustomKpiRequestsView && !showCustomKpiReviewView ? (
        <div className="rounded-md border bg-muted/20 p-3 text-sm text-muted-foreground">
          This workflow is only available to BLO (requesting) and DEV
          (reviewing) users.
        </div>
      ) : null}
    </section>
  );

  return (
    <div className="mx-auto w-full max-w-350 space-y-6 pb-8 sm:space-y-8">
      <Tabs
        defaultValue="definitions"
        className="space-y-4"
      >
        <TabsList className="h-auto flex-wrap justify-start gap-2 p-1">
          <TabsTrigger value="definitions">{definitionsTitle}</TabsTrigger>
          {!isBloRole ? (
            <TabsTrigger value="custom-kpi">Custom KPI Workflow</TabsTrigger>
          ) : null}
          <TabsTrigger value="targets">KPI Targets</TabsTrigger>
          <TabsTrigger value="limits">KPI Limits</TabsTrigger>
          {isDevRole ? (
            <TabsTrigger value="formula-builder">Formula Builder</TabsTrigger>
          ) : null}
        </TabsList>

        {!isBloRole ? (
          <TabsContent value="custom-kpi">
            {customKpiWorkflowSection}
          </TabsContent>
        ) : null}

        <TabsContent value="definitions">
          {isBloRole ? (
            customKpiWorkflowSection
          ) : (
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
                      key: "category_id",
                      type: "managed-list",
                      managedListName: "KPI Category",
                    },
                    {
                      key: "subcategory_id",
                      type: "managed-list",
                      managedListName: "KPI Sub-Category",
                    },
                    {
                      key: "unit_id",
                      type: "managed-list",
                      managedListName: "Unit",
                    },
                    {
                      key: "agg_level_id",
                      type: "managed-list",
                      managedListName: "Aggregation Level",
                    },
                    { key: "block", type: "number" },
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
                    { key: "description", type: "text" },
                    {
                      key: "category_id",
                      type: "managed-list",
                      managedListName: "KPI Category",
                    },
                    {
                      key: "subcategory_id",
                      type: "managed-list",
                      managedListName: "KPI Sub-Category",
                    },
                    {
                      key: "unit_id",
                      type: "managed-list",
                      managedListName: "Unit",
                    },
                    {
                      key: "agg_level_id",
                      type: "managed-list",
                      managedListName: "Aggregation Level",
                    },
                    { key: "block", type: "number" },
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
          )}
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

        {isDevRole ? (
          <TabsContent value="formula-builder">
            <section className="rounded-xl border bg-card p-4 sm:p-6">
              <p className="mb-4 text-sm text-muted-foreground">
                Choose a KPI, select input variables, and build the formula to
                be used in future KPI calculations.
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
        ) : null}
      </Tabs>
    </div>
  );
}
