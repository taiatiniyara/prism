import { ValueColumn } from "@/lib/data-entry/value-router";

export interface MeasureEntryFilterOption {
  id: number;
  name: string;
}

export interface MeasureEntryFilterOptions {
  reportPeriods: MeasureEntryFilterOption[];
  measureCategories: MeasureEntryFilterOption[];
  measureSubcategories: MeasureEntryFilterOption[];
  dataEntryStatuses: MeasureEntryFilterOption[];
}

export interface DimensionFilterOptions {
  energyProviders: MeasureEntryFilterOption[];
  energyTypes: MeasureEntryFilterOption[];
  energySources: MeasureEntryFilterOption[];
  customerTypes: MeasureEntryFilterOption[];
  paymentModes: MeasureEntryFilterOption[];
  consumptionBands: MeasureEntryFilterOption[];
  divisions: MeasureEntryFilterOption[];
  genders: MeasureEntryFilterOption[];
}

export interface MeasureEntryFilterContext {
  reportPeriodId: number | null;
  measureCategoryId: number | null;
  measureSubcategoryId: number | null;
  dataEntryStatusId: number | null;
  energyProviderId: number | null;
  energyTypeId: number | null;
  energySourceId: number | null;
  customerTypeId: number | null;
  paymentModeId: number | null;
  consumptionBandId: number | null;
  divisionId: number | null;
  genderId: number | null;
}

export const DEFAULT_DIMENSION_FILTERS: Pick<
  MeasureEntryFilterContext,
  | "energyProviderId"
  | "energyTypeId"
  | "energySourceId"
  | "customerTypeId"
  | "paymentModeId"
  | "consumptionBandId"
  | "divisionId"
  | "genderId"
> = {
  energyProviderId: null,
  energyTypeId: null,
  energySourceId: null,
  customerTypeId: null,
  paymentModeId: null,
  consumptionBandId: null,
  divisionId: null,
  genderId: null,
};

export interface MeasureEntryRowView {
  dataEntryId?: string;
  measureId: number;
  measureName: string;
  uomName: string | null;
  categoryName: string | null;
  subcategoryName: string | null;
  dataTypeId: number;
  dataTypeName: string | null;
  valueColumn: ValueColumn | null;
  valueNumeric: number | null;
  valueBoolean: boolean | null;
  valueOptionId: number | null;
  valueString: string | null;
  displayValue: string | null;
  energyProviderId: number;
  energyProviderName: string | null;
  energyTypeId: number;
  energyTypeName: string | null;
  energySourceId: number;
  energySourceName: string | null;
  customerTypeId: number;
  customerTypeName: string | null;
  paymentModeId: number;
  paymentModeName: string | null;
  consumptionBandId: number;
  consumptionBandName: string | null;
  divisionId: number;
  divisionName: string | null;
  genderId: number;
  genderName: string | null;
  unitId: number | null;
  unitName: string | null;
  statusId: number | null;
  statusName: string | null;
  isDataNotAvailable: boolean;
  isMandatory: boolean;
  validRangeMin: number | null;
  validRangeMax: number | null;
  validPolarityName: string | null;
  comments: string | null;
  updatedByName: string | null;
  updatedByRole: string | null;
  updatedAt: string | null;
}

export interface MeasureEntryProgressSummary {
  completedInputs: number;
  totalInputs: number;
  breakdown: MeasureEntryProgressBreakdownItem[];
}

export interface MeasureEntryProgressBreakdownItem {
  categoryName: string;
  subcategoryName: string;
  completedInputs: number;
  totalInputs: number;
}

export interface MeasureEntryPageViewModel {
  context: MeasureEntryFilterContext;
  options: MeasureEntryFilterOptions;
  dimensions: DimensionFilterOptions;
  progress: MeasureEntryProgressSummary;
  rows: MeasureEntryRowView[];
  applicableDimensions: string[];
}

export interface UpdateMeasureEntryValuePayload {
  dataEntryId?: string;
  measureId: number;
  energyProviderId: number;
  energyTypeId: number;
  energySourceId: number;
  customerTypeId: number;
  paymentModeId: number;
  consumptionBandId: number;
  divisionId: number;
  genderId: number;
  unitId?: number | null;
  valueNumeric?: number | null;
  valueBoolean?: boolean | null;
  valueOptionId?: number | null;
  valueString?: string | null;
}

export interface UpdateMeasureEntryAvailabilityPayload {
  dataEntryId?: string;
  measureId: number;
  energyProviderId: number;
  energyTypeId: number;
  energySourceId: number;
  customerTypeId: number;
  paymentModeId: number;
  consumptionBandId: number;
  divisionId: number;
  genderId: number;
  unitId?: number | null;
  isDataNotAvailable: boolean;
}

export interface UpdateMeasureEntryCommentPayload {
  dataEntryId?: string;
  measureId: number;
  energyProviderId: number;
  energyTypeId: number;
  energySourceId: number;
  customerTypeId: number;
  paymentModeId: number;
  consumptionBandId: number;
  divisionId: number;
  genderId: number;
  unitId?: number | null;
  comment: string;
}
