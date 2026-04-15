import DataTable from "@/components/tables/data-table";
import { AllUsers, CreateUser } from "./service";
import { User } from "@/db/schema/auth-schema";
import { AllRoles } from "../roles/roles.service";
import { AllOrganisations } from "../organisations/orgs.service";
import { getCurrentUser } from "@/lib/user.service";
import { DataTableCreateFormProps } from "@/components/tables/data-table-create-form";
import PendingUserDecisionPanel from "@/components/settings/pending-user-decision-panel";

const utilityRoles = ["BLO", "CEO", "DAOF", "DAOH", "DAOO", "MGR", "EXE"];

export default async function UsersSettingsPage() {
  const users = await AllUsers();
  let columns: string[] = [
    "name",
    "email",
    "role",
    "organisation",
    "data_access_reason",
    "dataset_required",
    "status",
  ];
  const currentUser = await getCurrentUser();
  let roles = await AllRoles();
  const orgs = await AllOrganisations();

  if (currentUser.role !== "DEV" && currentUser.role !== "BMO") {
    roles = roles.filter((role) => utilityRoles.includes(role.name));
    columns = columns.filter(
      (c) =>
        c !== "data_access_reason" &&
        c !== "dataset_required" &&
        c !== "organisation",
    );
  }

  const createFields: DataTableCreateFormProps<User>["fields"] = [
    {
      key: "name",
      type: "text",
    },
    {
      key: "email",
      type: "email",
    },
    {
      key: "role_id",
      type: "select",
      selectList: roles.map((role) => ({
        value: role.id,
        label: role.description || role.name,
      })),
    },
  ];

  if (currentUser.role === "DEV" || currentUser.role === "BMO") {
    createFields.push({
      key: "organisation_id",
      type: "select",
      selectList: orgs.map((org) => ({ value: org.id, label: org.name })),
    });
  }

  return (
    <>
      <DataTable<User>
        data={users}
        columns={columns}
        title="Users"
        createFormProps={{
          formAction: CreateUser,
          fields: createFields,
        }}
      />

      {(currentUser.role === "DEV" || currentUser.role === "BMO") && (
        <PendingUserDecisionPanel />
      )}
    </>
  );
}
