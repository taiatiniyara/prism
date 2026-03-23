"use server";

import {
	addReviewKpiInputComment,
	applyReviewKpiFilterCascade,
	buildReviewKpiFilterContextFromCookies,
	sanitizeReviewKpiFilterContext,
	updateReviewKpiInputValue,
} from "@/app/data-entry/review-kpi/service";
import {
	AddReviewKpiCommentPayload,
	ReviewKpiFilterContext,
	UpdateReviewKpiInputPayload,
} from "@/app/data-entry/review-kpi/types";
import { saveFilterContextToCookies } from "@/app/data-entry/filterContext.cookies";
import { getCurrentUser } from "@/lib/user.service";

export const updateReviewKpiFilterContextAction = async (
	changedKey: keyof ReviewKpiFilterContext,
	nextValue: number | null,
) => {
	const current = sanitizeReviewKpiFilterContext(
		await buildReviewKpiFilterContextFromCookies(),
	);

	const cascaded = applyReviewKpiFilterCascade(current, changedKey, nextValue);

	await saveFilterContextToCookies({
		reportTypeId: cascaded.reportTypeId,
		reportPeriodId: cascaded.reportPeriodId,
		inputCategoryId: cascaded.kpiCategoryId,
		inputSubcategoryId: cascaded.kpiSubcategoryId,
		serviceAreaId: cascaded.serviceAreaId,
	});

	return cascaded;
};

export const updateReviewKpiInputAction = async (
	dataEntryId: string,
	payload: UpdateReviewKpiInputPayload,
) => {
	const user = await getCurrentUser();
	return updateReviewKpiInputValue(dataEntryId, payload, user);
};

export const addReviewKpiCommentAction = async (
	dataEntryId: string,
	payload: AddReviewKpiCommentPayload,
) => {
	const user = await getCurrentUser();
	return addReviewKpiInputComment(dataEntryId, payload.comment, user);
};
