"use server";

import { db } from "@/db/connection";
import { Role, roles } from "@/db/schema/auth-schema";
import { countries, Country, SubRegion, subRegions } from "@/db/schema/country";
import { InputDefinition, inputDefinitions } from "@/db/schema/dataEntry";
import {
  ManagedList,
  ManagedListItem,
  managedListItems,
  managedLists,
} from "@/db/schema/managedLists";
import { ReportPeriod, reportPeriods } from "@/db/schema/reportPeriods";
import {
  EnergyResource,
  energyResources,
  Organisation,
  organisations,
  ServiceArea,
  serviceAreas,
} from "@/db/schema/utility";
import { gt } from "drizzle-orm";
import { revalidatePath } from "next/cache";

const prismOneURL = "https://prismdashboard.org/api/migration";

export async function retrieveRoles() {
  let res = false;
  await db.delete(roles).where(gt(roles.id, 0));
  const call = await fetch(prismOneURL + "/roles", {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });
  const list: Role[] = await call.json();

  const existingRoles = await db.select().from(roles);
  const existingIds = new Set(existingRoles.map((r) => r.id));
  const nonExistingRoles = list.filter((role) => !existingIds.has(role.id));
  try {
    if (nonExistingRoles.length > 0) {
      await db.insert(roles).values(nonExistingRoles);
    }
    res = true;
  } catch (error: Error | any) {
    console.log(error);
  }

  revalidatePath("/migration");

  return res;
}

export async function retrieveUtilityData() {
  let res = false;
  await db.delete(serviceAreas).where(gt(serviceAreas.id, 0));
  await db.delete(reportPeriods).where(gt(reportPeriods.id, 0));
  await db.delete(organisations).where(gt(organisations.id, 0));
  const call = await fetch(prismOneURL + "/organisation", {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });
  const list = await call.json();
  const serviceAreaList: ServiceArea[] = list.serviceAreas;
  const reportPeriodsList: ReportPeriod[] = list.reportPeriods;
  const orgList: Organisation[] = list.organisations;

  const existingOrgs = await db.select().from(organisations);
  const existingOrgIds = new Set(existingOrgs.map((o) => o.id));
  const nonExistingOrgs = orgList.filter((org) => !existingOrgIds.has(org.id));

  const existingSAs = await db.select().from(serviceAreas);
  const existingSAIds = new Set(existingSAs.map((sa) => sa.id));
  const nonExistingSAs = serviceAreaList.filter(
    (sa) => !existingSAIds.has(sa.id),
  );

  const existingRPs = await db.select().from(reportPeriods);
  const existingRPIds = new Set(existingRPs.map((rp) => rp.id));
  const nonExistingRPs = reportPeriodsList.filter(
    (rp) => !existingRPIds.has(rp.id),
  );

  try {
    if (nonExistingOrgs.length > 0) {
      await db.insert(organisations).values(nonExistingOrgs);
    }
    if (nonExistingSAs.length > 0) {
      await db.insert(serviceAreas).values(nonExistingSAs);
    }
    if (nonExistingRPs.length > 0) {
      await db.insert(reportPeriods).values(
        nonExistingRPs.map((rp) => ({
          ...rp,
          report_date: new Date(rp.report_date),
          request_date: new Date(rp.request_date),
          updated_at: rp.updated_at ? new Date(rp.updated_at) : new Date(),
        })),
      );
    }
    res = true;
  } catch (error: Error | any) {
    console.log(error);
  }

  revalidatePath("/migration");

  return res;
}

export async function retrieveCountries() {
  let res = false;
  await db.delete(subRegions).where(gt(subRegions.id, 0));
  await db.delete(countries).where(gt(countries.id, 0));
  const call = await fetch(prismOneURL + "/country", {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });
  const list = await call.json();
  const subRegionList: SubRegion[] = list.subregions;
  const existingSubRegions = await db.select().from(subRegions);
  const existingSubRegionIds = new Set(existingSubRegions.map((sr) => sr.id));
  const nonExistingSubRegions = subRegionList.filter(
    (sr) => !existingSubRegionIds.has(sr.id),
  );

  const countryList: Country[] = list.countries;
  const existingCountries = await db.select().from(countries);
  const existingCountryIds = new Set(existingCountries.map((c) => c.id));
  const nonExistingCountries = countryList.filter(
    (c) => !existingCountryIds.has(c.id),
  );

  try {
    if (nonExistingSubRegions.length > 0) {
      await db.insert(subRegions).values(nonExistingSubRegions);
    }
    if (nonExistingCountries.length > 0) {
      await db.insert(countries).values(
        nonExistingCountries.map((e) => {
          return {
            ...e,
            updated_date: new Date(e.updated_date),
          };
        }),
      );
    }
    res = true;
  } catch (error: Error | any) {
    console.log(error);
  }

  revalidatePath("/migration");

  return res;
}

export async function retrieveManagedLists() {
  let res = false;
  await db.delete(managedLists).where(gt(managedLists.id, 0));
  await db.delete(managedListItems).where(gt(managedListItems.id, 0));
  const call = await fetch(prismOneURL + "/managedList", {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });
  const list = await call.json();
  const managedListItemsList: ManagedListItem[] = list.managedListItems;
  const managedListsList: ManagedList[] = list.managedLists;

  const existingManagedLists = await db.select().from(managedLists);
  const existingManagedListIds = new Set(existingManagedLists.map((l) => l.id));
  const nonExistingManagedLists = managedListsList.filter(
    (l) => !existingManagedListIds.has(l.id),
  );

  const existingManagedListItems = await db.select().from(managedListItems);
  const existingManagedListItemIds = new Set(
    existingManagedListItems.map((li) => li.id),
  );
  const nonExistingManagedListItems = managedListItemsList.filter(
    (li) => !existingManagedListItemIds.has(li.id),
  );

  try {
    if (nonExistingManagedLists.length > 0) {
      await db.insert(managedLists).values(nonExistingManagedLists);
    }
    if (nonExistingManagedListItems.length > 0) {
      await db.insert(managedListItems).values(nonExistingManagedListItems);
    }
    res = true;
  } catch (error: Error | any) {
    console.log(error);
  }

  revalidatePath("/migration");

  return res;
}

export async function retrieveInputDefinitions() {
  let res = false;
  await db.delete(inputDefinitions).where(gt(inputDefinitions.id, 0));
  const call = await fetch(prismOneURL + "/inputDefinitions", {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });
  const list = await call.json();
  const inputDefinitionsList: InputDefinition[] = list.inputDefinitions;
  const existingInputDefinitions = await db.select().from(inputDefinitions);
  const existingInputDefinitionIds = new Set(
    existingInputDefinitions.map((id) => id.id),
  );
  const nonExistingInputDefinitions = inputDefinitionsList.filter(
    (def) => !existingInputDefinitionIds.has(def.id),
  );

  try {
    if (nonExistingInputDefinitions.length > 0) {
      await db.insert(inputDefinitions).values(
        nonExistingInputDefinitions.map((def) => ({
          ...def,
          energy_provider_id: 20,
          energy_source_id: 41,
        })),
      );
    }
    res = true;
  } catch (error: Error | any) {
    console.log(error);
  }

  revalidatePath("/migration");

  return res;
}

export async function retrieveReportPeriods() {
  let res = false;
  await db.delete(reportPeriods).where(gt(reportPeriods.id, 0));
  const call = await fetch(prismOneURL + "/reportPeriods", {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });
  const list = await call.json();
  const reportPeriodsList: ReportPeriod[] = list;
  const existingReportPeriods = await db.select().from(reportPeriods);
  const existingIds = new Set(existingReportPeriods.map((rp) => rp.id));
  const nonExistingReportPeriods = reportPeriodsList.filter(
    (rp) => !existingIds.has(rp.id),
  );

  console.log(nonExistingReportPeriods.length);
  try {
    if (nonExistingReportPeriods.length > 0) {
      await db.insert(reportPeriods).values(
        nonExistingReportPeriods.map((rp) => {
          return {
            ...rp,
            report_date: new Date(rp.report_date),
            request_date: new Date(rp.request_date),
            updated_at: rp.updated_at ? new Date(rp.updated_at) : new Date(),
            status_id: 844,
          };
        }),
      );
    }
    res = true;
  } catch (error: Error | any) {
    console.log(error);
  }

  revalidatePath("/migration");

  return res;
}

export async function retrieveEnergyResources() {
  let res = false;
  await db.delete(energyResources).where(gt(energyResources.id, 0));
  const call = await fetch(prismOneURL + "/generators", {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });
  const list = await call.json();
  console.log(list);
  const energyResourcesList: EnergyResource[] = list;
  const existingEnergyResources = await db.select().from(energyResources);
  const existingIds = new Set(existingEnergyResources.map((er) => er.id));
  const nonExistingEnergyResources = energyResourcesList.filter(
    (er) => !existingIds.has(er.id),
  );

  console.log(nonExistingEnergyResources.length);
  try {
    if (nonExistingEnergyResources.length > 0) {
      await db.insert(energyResources).values(
        nonExistingEnergyResources.map((er) => {
          return {
            ...er,
            capacity_mw: er.capacity_mw ? Number(er.capacity_mw) : null,
            updated_at: er.updated_at ? new Date(er.updated_at) : new Date(),
            updated_by_id: null,
          };
        }),
      );
    }
    res = true;
  } catch (error: Error | any) {
    console.log(error);
  }

  revalidatePath("/migration");

  return res;
}
