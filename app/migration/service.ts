"use server";

import { db } from "@/db/connection";
import { Role, roles } from "@/db/schema/auth-schema";
import { countries, Country, SubRegion, subRegions } from "@/db/schema/country";
import {
  ManagedList,
  ManagedListItem,
  managedListItems,
  managedLists,
} from "@/db/schema/managedLists";
import {
  Organisation,
  organisations,
  ServiceArea,
  serviceAreas,
} from "@/db/schema/utility";
import { revalidatePath } from "next/cache";

const prismOneURL = "https://prismdashboard.org/api/migration";

export async function retrieveRoles() {
  let res = false;
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
  const call = await fetch(prismOneURL + "/organisation", {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });
  const list = await call.json();
  const orgList: Organisation[] = list.organisations;
  const serviceAreaList: ServiceArea[] = list.serviceAreas;
  const orgs = await db.select().from(organisations);
  const nonExistingOrgs = orgList.filter((org) => !orgs.includes(org));
  const saList = await db.select().from(serviceAreas);
  const nonExistingSAs = serviceAreaList.filter((sa) => !saList.includes(sa));

  try {
    if (nonExistingOrgs.length > 0) {
      await db.insert(organisations).values(nonExistingOrgs);
    }
    if (nonExistingSAs.length > 0) {
      await db.insert(serviceAreas).values(nonExistingSAs);
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
