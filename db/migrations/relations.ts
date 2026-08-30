import { relations } from "drizzle-orm/relations";
import { aiChatSession, aiChatTurn, aiFeedback, user, countries, countryContext, measureDefinitions, auditLogs, account, session, userRegistrationClarificationMessage, organisations, roles, userStatusEvent, managedListItems, subRegions, kpiDefinitions, customKpiRequest, customKpiDecision, customKpiEmailDelivery, customKpiLifecycleEvent, dataEntries, dataEntryLogs, inputRelevance, emailSchedules, inputDlDefMappings, devValidationBuilderConfig, scheduleSendLogs, kpi, reportPeriods, governanceData, utilityContextData, bsc, kpiCalculationAttempts, units, powerStations, serviceAreas, assetClassRelevance, managedLists, aiReviewQueue, aiToolCall, twoFactor, bscUtilityNode, bscSpecificObjective, bscInitiative, bscTheme, bscTemplateNode, bscKpiLink, formulaBinding, formulaBindingDimension, aiUsageMetrics, bscKpiTargetPlan, bscObjectiveLink, bscTemplateLink, uiStyleOverride, aiCostBudget, alertRules, alertHistory, notifications, benchmarkingRequest, tariffRelevance, transmissionRelevance, measureDimensionScope, measureDimensionApplicability, kpiActual } from "./schema";

export const aiChatTurnRelations = relations(aiChatTurn, ({one, many}) => ({
	aiChatSession: one(aiChatSession, {
		fields: [aiChatTurn.sessionId],
		references: [aiChatSession.id]
	}),
	aiFeedbacks: many(aiFeedback),
	aiReviewQueues: many(aiReviewQueue),
	aiToolCalls: many(aiToolCall),
}));

export const aiChatSessionRelations = relations(aiChatSession, ({one, many}) => ({
	aiChatTurns: many(aiChatTurn),
	user: one(user, {
		fields: [aiChatSession.userId],
		references: [user.id]
	}),
}));

export const aiFeedbackRelations = relations(aiFeedback, ({one, many}) => ({
	aiChatTurn: one(aiChatTurn, {
		fields: [aiFeedback.turnId],
		references: [aiChatTurn.id]
	}),
	user: one(user, {
		fields: [aiFeedback.userId],
		references: [user.id]
	}),
	aiReviewQueues: many(aiReviewQueue),
}));

export const userRelations = relations(user, ({one, many}) => ({
	aiFeedbacks: many(aiFeedback),
	aiChatSessions: many(aiChatSession),
	auditLogs: many(auditLogs),
	accounts: many(account),
	sessions: many(session),
	userRegistrationClarificationMessages_actorUserId: many(userRegistrationClarificationMessage, {
		relationName: "userRegistrationClarificationMessage_actorUserId_user_id"
	}),
	userRegistrationClarificationMessages_targetUserId: many(userRegistrationClarificationMessage, {
		relationName: "userRegistrationClarificationMessage_targetUserId_user_id"
	}),
	organisation: one(organisations, {
		fields: [user.organisationId],
		references: [organisations.id]
	}),
	role: one(roles, {
		fields: [user.roleId],
		references: [roles.id]
	}),
	userStatusEvents_actorUserId: many(userStatusEvent, {
		relationName: "userStatusEvent_actorUserId_user_id"
	}),
	userStatusEvents_targetUserId: many(userStatusEvent, {
		relationName: "userStatusEvent_targetUserId_user_id"
	}),
	customKpiRequests: many(customKpiRequest),
	customKpiLifecycleEvents: many(customKpiLifecycleEvent),
	dataEntryLogs: many(dataEntryLogs),
	inputDlDefMappings: many(inputDlDefMappings),
	devValidationBuilderConfigs: many(devValidationBuilderConfig),
	bscs: many(bsc),
	units: many(units),
	aiReviewQueues: many(aiReviewQueue),
	customKpiDecisions: many(customKpiDecision),
	twoFactors: many(twoFactor),
	bscThemes: many(bscTheme),
	dataEntries: many(dataEntries),
	aiUsageMetrics: many(aiUsageMetrics),
	bscKpiTargetPlans: many(bscKpiTargetPlan),
	uiStyleOverrides: many(uiStyleOverride),
	aiCostBudgets: many(aiCostBudget),
	alertRules: many(alertRules),
	notifications: many(notifications),
	tariffRelevances: many(tariffRelevance),
	transmissionRelevances: many(transmissionRelevance),
	kpiDefinitions: many(kpiDefinitions),
}));

export const countryContextRelations = relations(countryContext, ({one}) => ({
	country: one(countries, {
		fields: [countryContext.countryId],
		references: [countries.id]
	}),
	measureDefinition: one(measureDefinitions, {
		fields: [countryContext.measureDefId],
		references: [measureDefinitions.id]
	}),
}));

export const countriesRelations = relations(countries, ({one, many}) => ({
	countryContexts: many(countryContext),
	managedListItem: one(managedListItems, {
		fields: [countries.currencyId],
		references: [managedListItems.id]
	}),
	subRegion: one(subRegions, {
		fields: [countries.subRegionId],
		references: [subRegions.id]
	}),
	organisations: many(organisations),
	dataEntries: many(dataEntries),
	kpiActuals: many(kpiActual),
}));

export const measureDefinitionsRelations = relations(measureDefinitions, ({one, many}) => ({
	countryContexts: many(countryContext),
	inputRelevances: many(inputRelevance),
	inputDlDefMappings: many(inputDlDefMappings),
	managedListItem_dataTypeId: one(managedListItems, {
		fields: [measureDefinitions.dataTypeId],
		references: [managedListItems.id],
		relationName: "measureDefinitions_dataTypeId_managedListItems_id"
	}),
	managedListItem_measuresGroupId: one(managedListItems, {
		fields: [measureDefinitions.measuresGroupId],
		references: [managedListItems.id],
		relationName: "measureDefinitions_measuresGroupId_managedListItems_id"
	}),
	managedListItem_measuresSubgroupId: one(managedListItems, {
		fields: [measureDefinitions.measuresSubgroupId],
		references: [managedListItems.id],
		relationName: "measureDefinitions_measuresSubgroupId_managedListItems_id"
	}),
	managedList: one(managedLists, {
		fields: [measureDefinitions.optionListId],
		references: [managedLists.id]
	}),
	managedListItem_strataId: one(managedListItems, {
		fields: [measureDefinitions.strataId],
		references: [managedListItems.id],
		relationName: "measureDefinitions_strataId_managedListItems_id"
	}),
	managedListItem_unitId: one(managedListItems, {
		fields: [measureDefinitions.unitId],
		references: [managedListItems.id],
		relationName: "measureDefinitions_unitId_managedListItems_id"
	}),
	managedListItem_validPolarityId: one(managedListItems, {
		fields: [measureDefinitions.validPolarityId],
		references: [managedListItems.id],
		relationName: "measureDefinitions_validPolarityId_managedListItems_id"
	}),
	managedListItem_validTrendId: one(managedListItems, {
		fields: [measureDefinitions.validTrendId],
		references: [managedListItems.id],
		relationName: "measureDefinitions_validTrendId_managedListItems_id"
	}),
	bscKpiLinks: many(bscKpiLink),
	dataEntries: many(dataEntries),
	formulaBindings: many(formulaBinding),
	tariffRelevances: many(tariffRelevance),
	transmissionRelevances: many(transmissionRelevance),
	measureDimensionScopes: many(measureDimensionScope),
	measureDimensionApplicabilities: many(measureDimensionApplicability),
}));

export const auditLogsRelations = relations(auditLogs, ({one}) => ({
	user: one(user, {
		fields: [auditLogs.actorUserId],
		references: [user.id]
	}),
}));

export const accountRelations = relations(account, ({one}) => ({
	user: one(user, {
		fields: [account.userId],
		references: [user.id]
	}),
}));

export const sessionRelations = relations(session, ({one}) => ({
	user: one(user, {
		fields: [session.userId],
		references: [user.id]
	}),
}));

export const userRegistrationClarificationMessageRelations = relations(userRegistrationClarificationMessage, ({one}) => ({
	user_actorUserId: one(user, {
		fields: [userRegistrationClarificationMessage.actorUserId],
		references: [user.id],
		relationName: "userRegistrationClarificationMessage_actorUserId_user_id"
	}),
	user_targetUserId: one(user, {
		fields: [userRegistrationClarificationMessage.targetUserId],
		references: [user.id],
		relationName: "userRegistrationClarificationMessage_targetUserId_user_id"
	}),
}));

export const organisationsRelations = relations(organisations, ({one, many}) => ({
	users: many(user),
	emailSchedules: many(emailSchedules),
	governanceData: many(governanceData),
	utilityContextData: many(utilityContextData),
	bscs: many(bsc),
	units: many(units),
	reportPeriods: many(reportPeriods),
	managedListItem_accountingStandardId: one(managedListItems, {
		fields: [organisations.accountingStandardId],
		references: [managedListItems.id],
		relationName: "organisations_accountingStandardId_managedListItems_id"
	}),
	country: one(countries, {
		fields: [organisations.countryId],
		references: [countries.id]
	}),
	managedListItem_electricityRegulationId: one(managedListItems, {
		fields: [organisations.electricityRegulationId],
		references: [managedListItems.id],
		relationName: "organisations_electricityRegulationId_managedListItems_id"
	}),
	managedListItem_entityTypeId: one(managedListItems, {
		fields: [organisations.entityTypeId],
		references: [managedListItems.id],
		relationName: "organisations_entityTypeId_managedListItems_id"
	}),
	managedListItem_operatingBasisId: one(managedListItems, {
		fields: [organisations.operatingBasisId],
		references: [managedListItems.id],
		relationName: "organisations_operatingBasisId_managedListItems_id"
	}),
	managedListItem_powerqualityStandardId: one(managedListItems, {
		fields: [organisations.powerqualityStandardId],
		references: [managedListItems.id],
		relationName: "organisations_powerqualityStandardId_managedListItems_id"
	}),
	managedListItem_ppaMembershipTypeId: one(managedListItems, {
		fields: [organisations.ppaMembershipTypeId],
		references: [managedListItems.id],
		relationName: "organisations_ppaMembershipTypeId_managedListItems_id"
	}),
	managedListItem_servicesProvidedId: one(managedListItems, {
		fields: [organisations.servicesProvidedId],
		references: [managedListItems.id],
		relationName: "organisations_servicesProvidedId_managedListItems_id"
	}),
	managedListItem_utilitySizeId: one(managedListItems, {
		fields: [organisations.utilitySizeId],
		references: [managedListItems.id],
		relationName: "organisations_utilitySizeId_managedListItems_id"
	}),
	managedListItem_utilityTypeId: one(managedListItems, {
		fields: [organisations.utilityTypeId],
		references: [managedListItems.id],
		relationName: "organisations_utilityTypeId_managedListItems_id"
	}),
	serviceAreas: many(serviceAreas),
	bscSpecificObjectives: many(bscSpecificObjective),
	bscInitiatives: many(bscInitiative),
	bscKpiLinks: many(bscKpiLink),
	bscUtilityNodes: many(bscUtilityNode),
	dataEntries: many(dataEntries),
	bscKpiTargetPlans: many(bscKpiTargetPlan),
	bscObjectiveLinks: many(bscObjectiveLink),
	benchmarkingRequests_benchmarkUtilityId: many(benchmarkingRequest, {
		relationName: "benchmarkingRequest_benchmarkUtilityId_organisations_id"
	}),
	benchmarkingRequests_requestingUtilityId: many(benchmarkingRequest, {
		relationName: "benchmarkingRequest_requestingUtilityId_organisations_id"
	}),
	powerStations: many(powerStations),
	kpiDefinitions: many(kpiDefinitions),
	kpiActuals_owningOrgId: many(kpiActual, {
		relationName: "kpiActual_owningOrgId_organisations_id"
	}),
	kpiActuals_utilityId: many(kpiActual, {
		relationName: "kpiActual_utilityId_organisations_id"
	}),
}));

export const rolesRelations = relations(roles, ({many}) => ({
	users: many(user),
	reportPeriods: many(reportPeriods),
}));

export const userStatusEventRelations = relations(userStatusEvent, ({one}) => ({
	user_actorUserId: one(user, {
		fields: [userStatusEvent.actorUserId],
		references: [user.id],
		relationName: "userStatusEvent_actorUserId_user_id"
	}),
	user_targetUserId: one(user, {
		fields: [userStatusEvent.targetUserId],
		references: [user.id],
		relationName: "userStatusEvent_targetUserId_user_id"
	}),
}));

export const managedListItemsRelations = relations(managedListItems, ({one, many}) => ({
	countries: many(countries),
	customKpiRequests: many(customKpiRequest),
	inputRelevances: many(inputRelevance),
	governanceData: many(governanceData),
	utilityContextData: many(utilityContextData),
	units_assetClassId: many(units, {
		relationName: "units_assetClassId_managedListItems_id"
	}),
	units_categoryId: many(units, {
		relationName: "units_categoryId_managedListItems_id"
	}),
	units_providerId: many(units, {
		relationName: "units_providerId_managedListItems_id"
	}),
	units_technologyId: many(units, {
		relationName: "units_technologyId_managedListItems_id"
	}),
	assetClassRelevances_assetClassId: many(assetClassRelevance, {
		relationName: "assetClassRelevance_assetClassId_managedListItems_id"
	}),
	assetClassRelevances_categoryId: many(assetClassRelevance, {
		relationName: "assetClassRelevance_categoryId_managedListItems_id"
	}),
	assetClassRelevances_technologyId: many(assetClassRelevance, {
		relationName: "assetClassRelevance_technologyId_managedListItems_id"
	}),
	managedList: one(managedLists, {
		fields: [managedListItems.listId],
		references: [managedLists.id]
	}),
	reportPeriods: many(reportPeriods),
	organisations_accountingStandardId: many(organisations, {
		relationName: "organisations_accountingStandardId_managedListItems_id"
	}),
	organisations_electricityRegulationId: many(organisations, {
		relationName: "organisations_electricityRegulationId_managedListItems_id"
	}),
	organisations_entityTypeId: many(organisations, {
		relationName: "organisations_entityTypeId_managedListItems_id"
	}),
	organisations_operatingBasisId: many(organisations, {
		relationName: "organisations_operatingBasisId_managedListItems_id"
	}),
	organisations_powerqualityStandardId: many(organisations, {
		relationName: "organisations_powerqualityStandardId_managedListItems_id"
	}),
	organisations_ppaMembershipTypeId: many(organisations, {
		relationName: "organisations_ppaMembershipTypeId_managedListItems_id"
	}),
	organisations_servicesProvidedId: many(organisations, {
		relationName: "organisations_servicesProvidedId_managedListItems_id"
	}),
	organisations_utilitySizeId: many(organisations, {
		relationName: "organisations_utilitySizeId_managedListItems_id"
	}),
	organisations_utilityTypeId: many(organisations, {
		relationName: "organisations_utilityTypeId_managedListItems_id"
	}),
	measureDefinitions_dataTypeId: many(measureDefinitions, {
		relationName: "measureDefinitions_dataTypeId_managedListItems_id"
	}),
	measureDefinitions_measuresGroupId: many(measureDefinitions, {
		relationName: "measureDefinitions_measuresGroupId_managedListItems_id"
	}),
	measureDefinitions_measuresSubgroupId: many(measureDefinitions, {
		relationName: "measureDefinitions_measuresSubgroupId_managedListItems_id"
	}),
	measureDefinitions_strataId: many(measureDefinitions, {
		relationName: "measureDefinitions_strataId_managedListItems_id"
	}),
	measureDefinitions_unitId: many(measureDefinitions, {
		relationName: "measureDefinitions_unitId_managedListItems_id"
	}),
	measureDefinitions_validPolarityId: many(measureDefinitions, {
		relationName: "measureDefinitions_validPolarityId_managedListItems_id"
	}),
	measureDefinitions_validTrendId: many(measureDefinitions, {
		relationName: "measureDefinitions_validTrendId_managedListItems_id"
	}),
	serviceAreas: many(serviceAreas),
	dataEntries_assetClassId: many(dataEntries, {
		relationName: "dataEntries_assetClassId_managedListItems_id"
	}),
	dataEntries_categoryId: many(dataEntries, {
		relationName: "dataEntries_categoryId_managedListItems_id"
	}),
	dataEntries_consumptionBandId: many(dataEntries, {
		relationName: "dataEntries_consumptionBandId_managedListItems_id"
	}),
	dataEntries_customerTypeId: many(dataEntries, {
		relationName: "dataEntries_customerTypeId_managedListItems_id"
	}),
	dataEntries_divisionId: many(dataEntries, {
		relationName: "dataEntries_divisionId_managedListItems_id"
	}),
	dataEntries_genderId: many(dataEntries, {
		relationName: "dataEntries_genderId_managedListItems_id"
	}),
	dataEntries_paymentModeId: many(dataEntries, {
		relationName: "dataEntries_paymentModeId_managedListItems_id"
	}),
	dataEntries_providerId: many(dataEntries, {
		relationName: "dataEntries_providerId_managedListItems_id"
	}),
	dataEntries_technologyId: many(dataEntries, {
		relationName: "dataEntries_technologyId_managedListItems_id"
	}),
	dataEntries_updateMediumId: many(dataEntries, {
		relationName: "dataEntries_updateMediumId_managedListItems_id"
	}),
	dataEntries_utilityFunctionId: many(dataEntries, {
		relationName: "dataEntries_utilityFunctionId_managedListItems_id"
	}),
	dataEntries_valueOptionId: many(dataEntries, {
		relationName: "dataEntries_valueOptionId_managedListItems_id"
	}),
	formulaBindingDimensions: many(formulaBindingDimension),
	benchmarkingRequests: many(benchmarkingRequest),
	tariffRelevances_customerTypeId: many(tariffRelevance, {
		relationName: "tariffRelevance_customerTypeId_managedListItems_id"
	}),
	tariffRelevances_paymentModeId: many(tariffRelevance, {
		relationName: "tariffRelevance_paymentModeId_managedListItems_id"
	}),
	kpiDefinitions_categoryId: many(kpiDefinitions, {
		relationName: "kpiDefinitions_categoryId_managedListItems_id"
	}),
	kpiDefinitions_strataId: many(kpiDefinitions, {
		relationName: "kpiDefinitions_strataId_managedListItems_id"
	}),
	kpiDefinitions_subcategoryId: many(kpiDefinitions, {
		relationName: "kpiDefinitions_subcategoryId_managedListItems_id"
	}),
	kpiDefinitions_unitId: many(kpiDefinitions, {
		relationName: "kpiDefinitions_unitId_managedListItems_id"
	}),
	measureDimensionApplicabilities: many(measureDimensionApplicability),
	kpiActuals_assetClassId: many(kpiActual, {
		relationName: "kpiActual_assetClassId_managedListItems_id"
	}),
	kpiActuals_categoryId: many(kpiActual, {
		relationName: "kpiActual_categoryId_managedListItems_id"
	}),
	kpiActuals_consumptionBandId: many(kpiActual, {
		relationName: "kpiActual_consumptionBandId_managedListItems_id"
	}),
	kpiActuals_customerTypeId: many(kpiActual, {
		relationName: "kpiActual_customerTypeId_managedListItems_id"
	}),
	kpiActuals_divisionId: many(kpiActual, {
		relationName: "kpiActual_divisionId_managedListItems_id"
	}),
	kpiActuals_genderId: many(kpiActual, {
		relationName: "kpiActual_genderId_managedListItems_id"
	}),
	kpiActuals_paymentModeId: many(kpiActual, {
		relationName: "kpiActual_paymentModeId_managedListItems_id"
	}),
	kpiActuals_providerId: many(kpiActual, {
		relationName: "kpiActual_providerId_managedListItems_id"
	}),
	kpiActuals_technologyId: many(kpiActual, {
		relationName: "kpiActual_technologyId_managedListItems_id"
	}),
	kpiActuals_utilityFunctionId: many(kpiActual, {
		relationName: "kpiActual_utilityFunctionId_managedListItems_id"
	}),
}));

export const subRegionsRelations = relations(subRegions, ({many}) => ({
	countries: many(countries),
	dataEntries: many(dataEntries),
	kpiActuals: many(kpiActual),
}));

export const customKpiRequestRelations = relations(customKpiRequest, ({one, many}) => ({
	kpiDefinition: one(kpiDefinitions, {
		fields: [customKpiRequest.replacementKpiDefId],
		references: [kpiDefinitions.id]
	}),
	user: one(user, {
		fields: [customKpiRequest.submitterUserId],
		references: [user.id]
	}),
	managedListItem: one(managedListItems, {
		fields: [customKpiRequest.unitId],
		references: [managedListItems.id]
	}),
	customKpiEmailDeliveries: many(customKpiEmailDelivery),
	customKpiLifecycleEvents: many(customKpiLifecycleEvent),
	customKpiDecisions: many(customKpiDecision),
	bscKpiLinks: many(bscKpiLink),
}));

export const kpiDefinitionsRelations = relations(kpiDefinitions, ({one, many}) => ({
	customKpiRequests: many(customKpiRequest),
	kpis: many(kpi),
	kpiCalculationAttempts: many(kpiCalculationAttempts),
	bscKpiLinks: many(bscKpiLink),
	bscKpiTargetPlans: many(bscKpiTargetPlan),
	managedListItem_categoryId: one(managedListItems, {
		fields: [kpiDefinitions.categoryId],
		references: [managedListItems.id],
		relationName: "kpiDefinitions_categoryId_managedListItems_id"
	}),
	user: one(user, {
		fields: [kpiDefinitions.ownerUserId],
		references: [user.id]
	}),
	organisation: one(organisations, {
		fields: [kpiDefinitions.ownerUtilityId],
		references: [organisations.id]
	}),
	managedListItem_strataId: one(managedListItems, {
		fields: [kpiDefinitions.strataId],
		references: [managedListItems.id],
		relationName: "kpiDefinitions_strataId_managedListItems_id"
	}),
	managedListItem_subcategoryId: one(managedListItems, {
		fields: [kpiDefinitions.subcategoryId],
		references: [managedListItems.id],
		relationName: "kpiDefinitions_subcategoryId_managedListItems_id"
	}),
	managedListItem_unitId: one(managedListItems, {
		fields: [kpiDefinitions.unitId],
		references: [managedListItems.id],
		relationName: "kpiDefinitions_unitId_managedListItems_id"
	}),
	kpiActuals: many(kpiActual),
}));

export const customKpiEmailDeliveryRelations = relations(customKpiEmailDelivery, ({one}) => ({
	customKpiDecision: one(customKpiDecision, {
		fields: [customKpiEmailDelivery.decisionId],
		references: [customKpiDecision.id]
	}),
	customKpiRequest: one(customKpiRequest, {
		fields: [customKpiEmailDelivery.requestId],
		references: [customKpiRequest.id]
	}),
}));

export const customKpiDecisionRelations = relations(customKpiDecision, ({one, many}) => ({
	customKpiEmailDeliveries: many(customKpiEmailDelivery),
	customKpiRequest: one(customKpiRequest, {
		fields: [customKpiDecision.requestId],
		references: [customKpiRequest.id]
	}),
	user: one(user, {
		fields: [customKpiDecision.reviewerUserId],
		references: [user.id]
	}),
}));

export const customKpiLifecycleEventRelations = relations(customKpiLifecycleEvent, ({one}) => ({
	user: one(user, {
		fields: [customKpiLifecycleEvent.actorUserId],
		references: [user.id]
	}),
	customKpiRequest: one(customKpiRequest, {
		fields: [customKpiLifecycleEvent.requestId],
		references: [customKpiRequest.id]
	}),
}));

export const dataEntryLogsRelations = relations(dataEntryLogs, ({one}) => ({
	dataEntry: one(dataEntries, {
		fields: [dataEntryLogs.dataEntryId],
		references: [dataEntries.id]
	}),
	user: one(user, {
		fields: [dataEntryLogs.updatedById],
		references: [user.id]
	}),
}));

export const dataEntriesRelations = relations(dataEntries, ({one, many}) => ({
	dataEntryLogs: many(dataEntryLogs),
	kpiCalculationAttempts: many(kpiCalculationAttempts),
	managedListItem_assetClassId: one(managedListItems, {
		fields: [dataEntries.assetClassId],
		references: [managedListItems.id],
		relationName: "dataEntries_assetClassId_managedListItems_id"
	}),
	managedListItem_categoryId: one(managedListItems, {
		fields: [dataEntries.categoryId],
		references: [managedListItems.id],
		relationName: "dataEntries_categoryId_managedListItems_id"
	}),
	managedListItem_consumptionBandId: one(managedListItems, {
		fields: [dataEntries.consumptionBandId],
		references: [managedListItems.id],
		relationName: "dataEntries_consumptionBandId_managedListItems_id"
	}),
	country: one(countries, {
		fields: [dataEntries.countryId],
		references: [countries.id]
	}),
	managedListItem_customerTypeId: one(managedListItems, {
		fields: [dataEntries.customerTypeId],
		references: [managedListItems.id],
		relationName: "dataEntries_customerTypeId_managedListItems_id"
	}),
	managedListItem_divisionId: one(managedListItems, {
		fields: [dataEntries.divisionId],
		references: [managedListItems.id],
		relationName: "dataEntries_divisionId_managedListItems_id"
	}),
	managedListItem_genderId: one(managedListItems, {
		fields: [dataEntries.genderId],
		references: [managedListItems.id],
		relationName: "dataEntries_genderId_managedListItems_id"
	}),
	measureDefinition: one(measureDefinitions, {
		fields: [dataEntries.measureDefId],
		references: [measureDefinitions.id]
	}),
	managedListItem_paymentModeId: one(managedListItems, {
		fields: [dataEntries.paymentModeId],
		references: [managedListItems.id],
		relationName: "dataEntries_paymentModeId_managedListItems_id"
	}),
	powerStation: one(powerStations, {
		fields: [dataEntries.powerStationId],
		references: [powerStations.id]
	}),
	managedListItem_providerId: one(managedListItems, {
		fields: [dataEntries.providerId],
		references: [managedListItems.id],
		relationName: "dataEntries_providerId_managedListItems_id"
	}),
	reportPeriod: one(reportPeriods, {
		fields: [dataEntries.reportPeriodId],
		references: [reportPeriods.id]
	}),
	serviceArea: one(serviceAreas, {
		fields: [dataEntries.serviceAreaId],
		references: [serviceAreas.id]
	}),
	subRegion: one(subRegions, {
		fields: [dataEntries.subregionId],
		references: [subRegions.id]
	}),
	managedListItem_technologyId: one(managedListItems, {
		fields: [dataEntries.technologyId],
		references: [managedListItems.id],
		relationName: "dataEntries_technologyId_managedListItems_id"
	}),
	unit: one(units, {
		fields: [dataEntries.unitId],
		references: [units.id]
	}),
	managedListItem_updateMediumId: one(managedListItems, {
		fields: [dataEntries.updateMediumId],
		references: [managedListItems.id],
		relationName: "dataEntries_updateMediumId_managedListItems_id"
	}),
	user: one(user, {
		fields: [dataEntries.updatedById],
		references: [user.id]
	}),
	managedListItem_utilityFunctionId: one(managedListItems, {
		fields: [dataEntries.utilityFunctionId],
		references: [managedListItems.id],
		relationName: "dataEntries_utilityFunctionId_managedListItems_id"
	}),
	organisation: one(organisations, {
		fields: [dataEntries.utilityId],
		references: [organisations.id]
	}),
	managedListItem_valueOptionId: one(managedListItems, {
		fields: [dataEntries.valueOptionId],
		references: [managedListItems.id],
		relationName: "dataEntries_valueOptionId_managedListItems_id"
	}),
}));

export const inputRelevanceRelations = relations(inputRelevance, ({one}) => ({
	managedListItem: one(managedListItems, {
		fields: [inputRelevance.dimensionId],
		references: [managedListItems.id]
	}),
	measureDefinition: one(measureDefinitions, {
		fields: [inputRelevance.measureDefId],
		references: [measureDefinitions.id]
	}),
}));

export const emailSchedulesRelations = relations(emailSchedules, ({one, many}) => ({
	organisation: one(organisations, {
		fields: [emailSchedules.utilityId],
		references: [organisations.id]
	}),
	scheduleSendLogs: many(scheduleSendLogs),
}));

export const inputDlDefMappingsRelations = relations(inputDlDefMappings, ({one}) => ({
	user: one(user, {
		fields: [inputDlDefMappings.approvedById],
		references: [user.id]
	}),
	measureDefinition: one(measureDefinitions, {
		fields: [inputDlDefMappings.measureDefId],
		references: [measureDefinitions.id]
	}),
}));

export const devValidationBuilderConfigRelations = relations(devValidationBuilderConfig, ({one}) => ({
	user: one(user, {
		fields: [devValidationBuilderConfig.updatedById],
		references: [user.id]
	}),
}));

export const scheduleSendLogsRelations = relations(scheduleSendLogs, ({one}) => ({
	emailSchedule: one(emailSchedules, {
		fields: [scheduleSendLogs.scheduleId],
		references: [emailSchedules.id]
	}),
}));

export const kpiRelations = relations(kpi, ({one}) => ({
	kpiDefinition: one(kpiDefinitions, {
		fields: [kpi.kpiDefId],
		references: [kpiDefinitions.id]
	}),
	reportPeriod: one(reportPeriods, {
		fields: [kpi.reportPeriodId],
		references: [reportPeriods.id]
	}),
}));

export const reportPeriodsRelations = relations(reportPeriods, ({one, many}) => ({
	kpis: many(kpi),
	kpiCalculationAttempts: many(kpiCalculationAttempts),
	managedListItem: one(managedListItems, {
		fields: [reportPeriods.reportTypeId],
		references: [managedListItems.id]
	}),
	organisation: one(organisations, {
		fields: [reportPeriods.utilityId],
		references: [organisations.id]
	}),
	role: one(roles, {
		fields: [reportPeriods.whoId],
		references: [roles.id]
	}),
	dataEntries: many(dataEntries),
	tariffRelevances: many(tariffRelevance),
	transmissionRelevances: many(transmissionRelevance),
}));

export const governanceDataRelations = relations(governanceData, ({one}) => ({
	managedListItem: one(managedListItems, {
		fields: [governanceData.dlDefId],
		references: [managedListItems.id]
	}),
	organisation: one(organisations, {
		fields: [governanceData.utilityId],
		references: [organisations.id]
	}),
}));

export const utilityContextDataRelations = relations(utilityContextData, ({one}) => ({
	managedListItem: one(managedListItems, {
		fields: [utilityContextData.dlDefId],
		references: [managedListItems.id]
	}),
	organisation: one(organisations, {
		fields: [utilityContextData.utilityId],
		references: [organisations.id]
	}),
}));

export const bscRelations = relations(bsc, ({one}) => ({
	user: one(user, {
		fields: [bsc.updatedById],
		references: [user.id]
	}),
	organisation: one(organisations, {
		fields: [bsc.utilityId],
		references: [organisations.id]
	}),
}));

export const kpiCalculationAttemptsRelations = relations(kpiCalculationAttempts, ({one}) => ({
	kpiDefinition: one(kpiDefinitions, {
		fields: [kpiCalculationAttempts.kpiDefId],
		references: [kpiDefinitions.id]
	}),
	reportPeriod: one(reportPeriods, {
		fields: [kpiCalculationAttempts.reportPeriodId],
		references: [reportPeriods.id]
	}),
	dataEntry: one(dataEntries, {
		fields: [kpiCalculationAttempts.sourceDataEntryId],
		references: [dataEntries.id]
	}),
}));

export const unitsRelations = relations(units, ({one, many}) => ({
	managedListItem_assetClassId: one(managedListItems, {
		fields: [units.assetClassId],
		references: [managedListItems.id],
		relationName: "units_assetClassId_managedListItems_id"
	}),
	managedListItem_categoryId: one(managedListItems, {
		fields: [units.categoryId],
		references: [managedListItems.id],
		relationName: "units_categoryId_managedListItems_id"
	}),
	powerStation: one(powerStations, {
		fields: [units.powerStationId],
		references: [powerStations.id]
	}),
	managedListItem_providerId: one(managedListItems, {
		fields: [units.providerId],
		references: [managedListItems.id],
		relationName: "units_providerId_managedListItems_id"
	}),
	serviceArea: one(serviceAreas, {
		fields: [units.serviceAreaId],
		references: [serviceAreas.id]
	}),
	managedListItem_technologyId: one(managedListItems, {
		fields: [units.technologyId],
		references: [managedListItems.id],
		relationName: "units_technologyId_managedListItems_id"
	}),
	user: one(user, {
		fields: [units.updatedById],
		references: [user.id]
	}),
	organisation: one(organisations, {
		fields: [units.utilityId],
		references: [organisations.id]
	}),
	dataEntries: many(dataEntries),
	kpiActuals: many(kpiActual),
}));

export const powerStationsRelations = relations(powerStations, ({one, many}) => ({
	units: many(units),
	dataEntries: many(dataEntries),
	serviceArea: one(serviceAreas, {
		fields: [powerStations.serviceAreaId],
		references: [serviceAreas.id]
	}),
	organisation: one(organisations, {
		fields: [powerStations.utilityId],
		references: [organisations.id]
	}),
	kpiActuals: many(kpiActual),
}));

export const serviceAreasRelations = relations(serviceAreas, ({one, many}) => ({
	units: many(units),
	managedListItem: one(managedListItems, {
		fields: [serviceAreas.strataId],
		references: [managedListItems.id]
	}),
	organisation: one(organisations, {
		fields: [serviceAreas.utilityId],
		references: [organisations.id]
	}),
	dataEntries: many(dataEntries),
	powerStations: many(powerStations),
	tariffRelevances: many(tariffRelevance),
	transmissionRelevances: many(transmissionRelevance),
	kpiActuals: many(kpiActual),
}));

export const assetClassRelevanceRelations = relations(assetClassRelevance, ({one}) => ({
	managedListItem_assetClassId: one(managedListItems, {
		fields: [assetClassRelevance.assetClassId],
		references: [managedListItems.id],
		relationName: "assetClassRelevance_assetClassId_managedListItems_id"
	}),
	managedListItem_categoryId: one(managedListItems, {
		fields: [assetClassRelevance.categoryId],
		references: [managedListItems.id],
		relationName: "assetClassRelevance_categoryId_managedListItems_id"
	}),
	managedListItem_technologyId: one(managedListItems, {
		fields: [assetClassRelevance.technologyId],
		references: [managedListItems.id],
		relationName: "assetClassRelevance_technologyId_managedListItems_id"
	}),
}));

export const managedListsRelations = relations(managedLists, ({many}) => ({
	managedListItems: many(managedListItems),
	measureDefinitions: many(measureDefinitions),
}));

export const aiReviewQueueRelations = relations(aiReviewQueue, ({one}) => ({
	aiFeedback: one(aiFeedback, {
		fields: [aiReviewQueue.flaggedByFeedbackId],
		references: [aiFeedback.id]
	}),
	user: one(user, {
		fields: [aiReviewQueue.reviewerUserId],
		references: [user.id]
	}),
	aiChatTurn: one(aiChatTurn, {
		fields: [aiReviewQueue.turnId],
		references: [aiChatTurn.id]
	}),
}));

export const aiToolCallRelations = relations(aiToolCall, ({one}) => ({
	aiChatTurn: one(aiChatTurn, {
		fields: [aiToolCall.turnId],
		references: [aiChatTurn.id]
	}),
}));

export const twoFactorRelations = relations(twoFactor, ({one}) => ({
	user: one(user, {
		fields: [twoFactor.userId],
		references: [user.id]
	}),
}));

export const bscSpecificObjectiveRelations = relations(bscSpecificObjective, ({one, many}) => ({
	bscUtilityNode: one(bscUtilityNode, {
		fields: [bscSpecificObjective.leverNodeId],
		references: [bscUtilityNode.id]
	}),
	organisation: one(organisations, {
		fields: [bscSpecificObjective.utilityId],
		references: [organisations.id]
	}),
	bscInitiatives: many(bscInitiative),
}));

export const bscUtilityNodeRelations = relations(bscUtilityNode, ({one, many}) => ({
	bscSpecificObjectives: many(bscSpecificObjective),
	bscUtilityNode: one(bscUtilityNode, {
		fields: [bscUtilityNode.parentNodeId],
		references: [bscUtilityNode.id],
		relationName: "bscUtilityNode_parentNodeId_bscUtilityNode_id"
	}),
	bscUtilityNodes: many(bscUtilityNode, {
		relationName: "bscUtilityNode_parentNodeId_bscUtilityNode_id"
	}),
	bscTemplateNode: one(bscTemplateNode, {
		fields: [bscUtilityNode.templateNodeId],
		references: [bscTemplateNode.id]
	}),
	organisation: one(organisations, {
		fields: [bscUtilityNode.utilityId],
		references: [organisations.id]
	}),
	bscObjectiveLinks_sourceNodeId: many(bscObjectiveLink, {
		relationName: "bscObjectiveLink_sourceNodeId_bscUtilityNode_id"
	}),
	bscObjectiveLinks_targetNodeId: many(bscObjectiveLink, {
		relationName: "bscObjectiveLink_targetNodeId_bscUtilityNode_id"
	}),
}));

export const bscInitiativeRelations = relations(bscInitiative, ({one, many}) => ({
	bscSpecificObjective: one(bscSpecificObjective, {
		fields: [bscInitiative.specificObjectiveId],
		references: [bscSpecificObjective.id]
	}),
	organisation: one(organisations, {
		fields: [bscInitiative.utilityId],
		references: [organisations.id]
	}),
	bscKpiLinks: many(bscKpiLink),
}));

export const bscThemeRelations = relations(bscTheme, ({one}) => ({
	user: one(user, {
		fields: [bscTheme.updatedById],
		references: [user.id]
	}),
}));

export const bscTemplateNodeRelations = relations(bscTemplateNode, ({one, many}) => ({
	bscTemplateNode: one(bscTemplateNode, {
		fields: [bscTemplateNode.parentId],
		references: [bscTemplateNode.id],
		relationName: "bscTemplateNode_parentId_bscTemplateNode_id"
	}),
	bscTemplateNodes: many(bscTemplateNode, {
		relationName: "bscTemplateNode_parentId_bscTemplateNode_id"
	}),
	bscUtilityNodes: many(bscUtilityNode),
	bscTemplateLinks_sourceNodeId: many(bscTemplateLink, {
		relationName: "bscTemplateLink_sourceNodeId_bscTemplateNode_id"
	}),
	bscTemplateLinks_targetNodeId: many(bscTemplateLink, {
		relationName: "bscTemplateLink_targetNodeId_bscTemplateNode_id"
	}),
}));

export const bscKpiLinkRelations = relations(bscKpiLink, ({one}) => ({
	bscInitiative: one(bscInitiative, {
		fields: [bscKpiLink.initiativeId],
		references: [bscInitiative.id]
	}),
	measureDefinition: one(measureDefinitions, {
		fields: [bscKpiLink.inputDefinitionId],
		references: [measureDefinitions.id]
	}),
	kpiDefinition: one(kpiDefinitions, {
		fields: [bscKpiLink.kpiDefId],
		references: [kpiDefinitions.id]
	}),
	customKpiRequest: one(customKpiRequest, {
		fields: [bscKpiLink.pendingCustomKpiRequestId],
		references: [customKpiRequest.id]
	}),
	organisation: one(organisations, {
		fields: [bscKpiLink.utilityId],
		references: [organisations.id]
	}),
}));

export const formulaBindingRelations = relations(formulaBinding, ({one, many}) => ({
	measureDefinition: one(measureDefinitions, {
		fields: [formulaBinding.inputMeasureDefId],
		references: [measureDefinitions.id]
	}),
	formulaBindingDimensions: many(formulaBindingDimension),
}));

export const formulaBindingDimensionRelations = relations(formulaBindingDimension, ({one}) => ({
	formulaBinding: one(formulaBinding, {
		fields: [formulaBindingDimension.bindingId],
		references: [formulaBinding.id]
	}),
	managedListItem: one(managedListItems, {
		fields: [formulaBindingDimension.memberId],
		references: [managedListItems.id]
	}),
}));

export const aiUsageMetricsRelations = relations(aiUsageMetrics, ({one}) => ({
	user: one(user, {
		fields: [aiUsageMetrics.userId],
		references: [user.id]
	}),
}));

export const bscKpiTargetPlanRelations = relations(bscKpiTargetPlan, ({one}) => ({
	kpiDefinition: one(kpiDefinitions, {
		fields: [bscKpiTargetPlan.kpiDefId],
		references: [kpiDefinitions.id]
	}),
	user: one(user, {
		fields: [bscKpiTargetPlan.updatedById],
		references: [user.id]
	}),
	organisation: one(organisations, {
		fields: [bscKpiTargetPlan.utilityId],
		references: [organisations.id]
	}),
}));

export const bscObjectiveLinkRelations = relations(bscObjectiveLink, ({one}) => ({
	bscUtilityNode_sourceNodeId: one(bscUtilityNode, {
		fields: [bscObjectiveLink.sourceNodeId],
		references: [bscUtilityNode.id],
		relationName: "bscObjectiveLink_sourceNodeId_bscUtilityNode_id"
	}),
	bscUtilityNode_targetNodeId: one(bscUtilityNode, {
		fields: [bscObjectiveLink.targetNodeId],
		references: [bscUtilityNode.id],
		relationName: "bscObjectiveLink_targetNodeId_bscUtilityNode_id"
	}),
	organisation: one(organisations, {
		fields: [bscObjectiveLink.utilityId],
		references: [organisations.id]
	}),
}));

export const bscTemplateLinkRelations = relations(bscTemplateLink, ({one}) => ({
	bscTemplateNode_sourceNodeId: one(bscTemplateNode, {
		fields: [bscTemplateLink.sourceNodeId],
		references: [bscTemplateNode.id],
		relationName: "bscTemplateLink_sourceNodeId_bscTemplateNode_id"
	}),
	bscTemplateNode_targetNodeId: one(bscTemplateNode, {
		fields: [bscTemplateLink.targetNodeId],
		references: [bscTemplateNode.id],
		relationName: "bscTemplateLink_targetNodeId_bscTemplateNode_id"
	}),
}));

export const uiStyleOverrideRelations = relations(uiStyleOverride, ({one}) => ({
	user: one(user, {
		fields: [uiStyleOverride.updatedById],
		references: [user.id]
	}),
}));

export const aiCostBudgetRelations = relations(aiCostBudget, ({one}) => ({
	user: one(user, {
		fields: [aiCostBudget.userId],
		references: [user.id]
	}),
}));

export const alertRulesRelations = relations(alertRules, ({one, many}) => ({
	user: one(user, {
		fields: [alertRules.userId],
		references: [user.id]
	}),
	alertHistories: many(alertHistory),
}));

export const alertHistoryRelations = relations(alertHistory, ({one}) => ({
	alertRule: one(alertRules, {
		fields: [alertHistory.ruleId],
		references: [alertRules.id]
	}),
}));

export const notificationsRelations = relations(notifications, ({one}) => ({
	user: one(user, {
		fields: [notifications.userId],
		references: [user.id]
	}),
}));

export const benchmarkingRequestRelations = relations(benchmarkingRequest, ({one}) => ({
	organisation_benchmarkUtilityId: one(organisations, {
		fields: [benchmarkingRequest.benchmarkUtilityId],
		references: [organisations.id],
		relationName: "benchmarkingRequest_benchmarkUtilityId_organisations_id"
	}),
	managedListItem: one(managedListItems, {
		fields: [benchmarkingRequest.decisionTypeId],
		references: [managedListItems.id]
	}),
	organisation_requestingUtilityId: one(organisations, {
		fields: [benchmarkingRequest.requestingUtilityId],
		references: [organisations.id],
		relationName: "benchmarkingRequest_requestingUtilityId_organisations_id"
	}),
}));

export const tariffRelevanceRelations = relations(tariffRelevance, ({one}) => ({
	managedListItem_customerTypeId: one(managedListItems, {
		fields: [tariffRelevance.customerTypeId],
		references: [managedListItems.id],
		relationName: "tariffRelevance_customerTypeId_managedListItems_id"
	}),
	measureDefinition: one(measureDefinitions, {
		fields: [tariffRelevance.measureDefId],
		references: [measureDefinitions.id]
	}),
	managedListItem_paymentModeId: one(managedListItems, {
		fields: [tariffRelevance.paymentModeId],
		references: [managedListItems.id],
		relationName: "tariffRelevance_paymentModeId_managedListItems_id"
	}),
	reportPeriod: one(reportPeriods, {
		fields: [tariffRelevance.reportPeriodId],
		references: [reportPeriods.id]
	}),
	serviceArea: one(serviceAreas, {
		fields: [tariffRelevance.serviceAreaId],
		references: [serviceAreas.id]
	}),
	user: one(user, {
		fields: [tariffRelevance.updatedById],
		references: [user.id]
	}),
}));

export const transmissionRelevanceRelations = relations(transmissionRelevance, ({one}) => ({
	measureDefinition: one(measureDefinitions, {
		fields: [transmissionRelevance.measureDefId],
		references: [measureDefinitions.id]
	}),
	reportPeriod: one(reportPeriods, {
		fields: [transmissionRelevance.reportPeriodId],
		references: [reportPeriods.id]
	}),
	serviceArea: one(serviceAreas, {
		fields: [transmissionRelevance.serviceAreaId],
		references: [serviceAreas.id]
	}),
	user: one(user, {
		fields: [transmissionRelevance.updatedById],
		references: [user.id]
	}),
}));

export const measureDimensionScopeRelations = relations(measureDimensionScope, ({one}) => ({
	measureDefinition: one(measureDefinitions, {
		fields: [measureDimensionScope.measureId],
		references: [measureDefinitions.id]
	}),
}));

export const measureDimensionApplicabilityRelations = relations(measureDimensionApplicability, ({one}) => ({
	measureDefinition: one(measureDefinitions, {
		fields: [measureDimensionApplicability.measureId],
		references: [measureDefinitions.id]
	}),
	managedListItem: one(managedListItems, {
		fields: [measureDimensionApplicability.memberId],
		references: [managedListItems.id]
	}),
}));

export const kpiActualRelations = relations(kpiActual, ({one}) => ({
	managedListItem_assetClassId: one(managedListItems, {
		fields: [kpiActual.assetClassId],
		references: [managedListItems.id],
		relationName: "kpiActual_assetClassId_managedListItems_id"
	}),
	managedListItem_categoryId: one(managedListItems, {
		fields: [kpiActual.categoryId],
		references: [managedListItems.id],
		relationName: "kpiActual_categoryId_managedListItems_id"
	}),
	managedListItem_consumptionBandId: one(managedListItems, {
		fields: [kpiActual.consumptionBandId],
		references: [managedListItems.id],
		relationName: "kpiActual_consumptionBandId_managedListItems_id"
	}),
	country: one(countries, {
		fields: [kpiActual.countryId],
		references: [countries.id]
	}),
	managedListItem_customerTypeId: one(managedListItems, {
		fields: [kpiActual.customerTypeId],
		references: [managedListItems.id],
		relationName: "kpiActual_customerTypeId_managedListItems_id"
	}),
	managedListItem_divisionId: one(managedListItems, {
		fields: [kpiActual.divisionId],
		references: [managedListItems.id],
		relationName: "kpiActual_divisionId_managedListItems_id"
	}),
	managedListItem_genderId: one(managedListItems, {
		fields: [kpiActual.genderId],
		references: [managedListItems.id],
		relationName: "kpiActual_genderId_managedListItems_id"
	}),
	kpiDefinition: one(kpiDefinitions, {
		fields: [kpiActual.kpiDefId],
		references: [kpiDefinitions.id]
	}),
	organisation_owningOrgId: one(organisations, {
		fields: [kpiActual.owningOrgId],
		references: [organisations.id],
		relationName: "kpiActual_owningOrgId_organisations_id"
	}),
	managedListItem_paymentModeId: one(managedListItems, {
		fields: [kpiActual.paymentModeId],
		references: [managedListItems.id],
		relationName: "kpiActual_paymentModeId_managedListItems_id"
	}),
	powerStation: one(powerStations, {
		fields: [kpiActual.powerStationId],
		references: [powerStations.id]
	}),
	managedListItem_providerId: one(managedListItems, {
		fields: [kpiActual.providerId],
		references: [managedListItems.id],
		relationName: "kpiActual_providerId_managedListItems_id"
	}),
	serviceArea: one(serviceAreas, {
		fields: [kpiActual.serviceAreaId],
		references: [serviceAreas.id]
	}),
	subRegion: one(subRegions, {
		fields: [kpiActual.subregionId],
		references: [subRegions.id]
	}),
	managedListItem_technologyId: one(managedListItems, {
		fields: [kpiActual.technologyId],
		references: [managedListItems.id],
		relationName: "kpiActual_technologyId_managedListItems_id"
	}),
	unit: one(units, {
		fields: [kpiActual.unitId],
		references: [units.id]
	}),
	managedListItem_utilityFunctionId: one(managedListItems, {
		fields: [kpiActual.utilityFunctionId],
		references: [managedListItems.id],
		relationName: "kpiActual_utilityFunctionId_managedListItems_id"
	}),
	organisation_utilityId: one(organisations, {
		fields: [kpiActual.utilityId],
		references: [organisations.id],
		relationName: "kpiActual_utilityId_organisations_id"
	}),
}));