import DataTable from "@/components/tables/data-table";
import {
  AcceptExternalRegistration,
  ExternalRegistrationsList,
  RejectExternalRegistration,
} from "./service";
import { ExternalRegistration } from "@/db/schema/auth-schema";
import { db } from "@/db/connection";
import { roles } from "@/db/schema/auth-schema";
import ExternalRegistrationActionPanel from "./action-panel";

async function getNonDevRoles() {
  const allRoles = await db.select().from(roles).orderBy(roles.name);
  return allRoles.filter((r) => r.name !== "DEV").map((r) => ({
    value: r.id,
    label: r.name,
  }));
}

export default async function ExternalRegistrationsPage() {
  const list = await ExternalRegistrationsList();
  const roleOptions = await getNonDevRoles();

  return (
    <div className="space-y-4">
      <DataTable<ExternalRegistration>
        columns={[
          "name",
          "email",
          "organisation",
          "dataset_required",
          "data_access_reason",
          "date_created",
        ]}
        data={list}
        title="External Registrations"
      />
      <ExternalRegistrationActionPanel
        registrations={list}
        roles={roleOptions}
        acceptAction={AcceptExternalRegistration}
        rejectAction={RejectExternalRegistration}
      />
    </div>
  );
}
