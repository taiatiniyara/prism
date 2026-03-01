import DataTable from "@/components/tables/data-table";
import { AllUsers, CreateUser } from "./service";
import { User } from "@/db/schema/auth-schema";

export default async function UsersSettingsPage() {
  const users = await AllUsers();
  return (
    <DataTable<User>
      data={users}
      columns={[
        "name",
        "role",
        "organisation",
        "data_access_reason",
        "dataset_required",
        "status",
      ]}
      title="Users"
      createFormProps={{
        formAction: CreateUser,
        fields: [
          {
            key: "name",
            type: "text",
          },
          {
            key: "email",
            type: "email",
          },
        ],
      }}
    />
  );
}
