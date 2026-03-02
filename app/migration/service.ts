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
  const nonExistingRoles = list.filter((role) => !existingRoles.includes(role));
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
  await db.delete(energyResources).where(gt(energyResources.id, 0));
  await db.delete(reportPeriods).where(gt(reportPeriods.id, 0));
  await db.delete(organisations).where(gt(organisations.id, 0));
  const call = await fetch(prismOneURL + "/organisation", {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });
  const list = await call.json();
  const energyResourcesList: EnergyResource[] = list.generators;
  const serviceAreaList: ServiceArea[] = list.serviceAreas;
  const reportPeriodsList: ReportPeriod[] = list.reportPeriods;
  const orgList: Organisation[] = list.organisations;
  const orgs = await db.select().from(organisations);
  const nonExistingOrgs = orgList.filter((org) => !orgs.includes(org));
  const saList = await db.select().from(serviceAreas);
  const nonExistingSAs = serviceAreaList.filter((sa) => !saList.includes(sa));
  const rpList = await db.select().from(reportPeriods);
  const nonExistingRPs = reportPeriodsList.filter((rp) => !rpList.includes(rp));
  const erList = await db.select().from(energyResources);
  const nonExistingERs = energyResourcesList.filter(
    (er) => !erList.includes(er),
  );

  try {
    if (nonExistingOrgs.length > 0) {
      await db.insert(organisations).values(nonExistingOrgs);
    }
    if (nonExistingSAs.length > 0) {
      await db.insert(serviceAreas).values(nonExistingSAs);
    }
    if (nonExistingRPs.length > 0) {
      await db.insert(reportPeriods).values(nonExistingRPs);
    }
    if (nonExistingERs.length > 0) {
      await db.insert(energyResources).values(nonExistingERs);
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
  const nonExistingSubRegions = subRegionList.filter(
    (subRegion) => !existingSubRegions.includes(subRegion),
  );
  const countryList: Country[] = list.countries;
  const existingCountries = await db.select().from(countries);
  const nonExistingCountries = countryList.filter(
    (country) => !existingCountries.includes(country),
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
  const nonExistingManagedLists = managedListsList.filter(
    (managedList) => !existingManagedLists.includes(managedList),
  );
  const existingManagedListItems = await db.select().from(managedListItems);
  const nonExistingManagedListItems = managedListItemsList.filter(
    (managedListItem) => !existingManagedListItems.includes(managedListItem),
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
  const nonExistingInputDefinitions = inputDefinitionsList.filter(
    (inputDefinition) => !existingInputDefinitions.includes(inputDefinition),
  );
  try {
    if (nonExistingInputDefinitions.length > 0) {
      await db.insert(inputDefinitions).values(nonExistingInputDefinitions);
    }
    res = true;
  } catch (error: Error | any) {
    console.log(error);
  }

  revalidatePath("/migration");

  return res;
}
