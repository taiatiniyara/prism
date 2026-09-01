import DataTable from "@/components/tables/data-table";
import { AllCountries } from "../countries/service";
import {
  AllOrganisations,
  CreateOrganisation,
  UpdateOrganisation,
} from "./orgs.service";
import { Organisation } from "@/db/schema/utility";
import { getCurrentUser } from "@/lib/user.service";
import { redirect } from "next/navigation";

export default async function OrganisationsSettingsPage() {
  const currentUser = await getCurrentUser();
  if (currentUser.role !== "BMO" && currentUser.role !== "DEV") {
    redirect("/settings");
  }
  const orgs = await AllOrganisations();
  const countries = await AllCountries();
  return (
    <DataTable<Organisation>
      columns={["name", "country", "is_utility", "is_active"]}
      data={orgs}
      title="Organisations"
      createFormProps={{
        formAction: CreateOrganisation,
        fields: [
          {
            key: "name",
            type: "text",
          },
          {
            key: "country_id",
            type: "select",
            selectList: countries.map((country) => ({
              value: country.id,
              label: country.name,
            })),
          },
          {
            key: "is_utility",
            type: "checkbox",
          },
          {
            key: "powequality_standard_id",
            managedListName: "Power Quality Standard",
            type: "managed-list",
          },
          {
            key: "electricity_regulation_id",
            managedListName: "Electricity Regulation",
            type: "managed-list",
          },
          {
            key: "accounting_standard_id",
            managedListName: "Accounting Standard",
            type: "managed-list",
          },
          {
            key: "entity_type_id",
            managedListName: "Entity Type",
            type: "managed-list",
          },
          {
            key: "utility_type_id",
            managedListName: "Utility Type",
            type: "managed-list",
          },
          {
            key: "operating_basis_id",
            managedListName: "Operating Basis",
            type: "managed-list",
          },
          {
            key: "ppa_membership_type_id",
            managedListName: "PPA Membership Type",
            type: "managed-list",
          },
          {
            key: "utility_size_id",
            managedListName: "Utility Size",
            type: "managed-list",
          },
          {
            key: "services_provided_id",
            managedListName: "Services Provided",
            type: "managed-list",
          },
        ],
      }}
      updateFormProps={{
        formAction: UpdateOrganisation,
        fields: [
          {
            key: "name",
            type: "text",
          },
          {
            key: "country_id",
            type: "select",
            selectList: countries.map((country) => ({
              value: country.id,
              label: country.name,
            })),
          },
          {
            key: "is_utility",
            type: "checkbox",
          },
          {
            key: "powequality_standard_id",
            managedListName: "Power Quality Standard",
            type: "managed-list",
          },
          {
            key: "electricity_regulation_id",
            managedListName: "Electricity Regulation",
            type: "managed-list",
          },
          {
            key: "accounting_standard_id",
            managedListName: "Accounting Standard",
            type: "managed-list",
          },
          {
            key: "entity_type_id",
            managedListName: "Entity Type",
            type: "managed-list",
          },
          {
            key: "utility_type_id",
            managedListName: "Utility Type",
            type: "managed-list",
          },
          {
            key: "operating_basis_id",
            managedListName: "Operating Basis",
            type: "managed-list",
          },
          {
            key: "ppa_membership_type_id",
            managedListName: "PPA Membership Type",
            type: "managed-list",
          },
          {
            key: "utility_size_id",
            managedListName: "Utility Size",
            type: "managed-list",
          },
          {
            key: "services_provided_id",
            managedListName: "Services Provided",
            type: "managed-list",
          },
        ],
      }}
    />
  );
}
