import DataTable from "@/components/tables/data-table";
import {
  CreateInputRelevance,
  InputRelevanceList,
  UpdateInputRelevance,
} from "./service";
import { InputRelevance } from "@/db/schema/dataEntry";
import { GetAllInputDefinitions } from "../inputs/service";
import { GetAllManagedListItems } from "../managed-lists/service";

export default async function RelevanceSettingsPage() {
  const list = await InputRelevanceList();
  const inputs = await GetAllInputDefinitions();
  const ml = await GetAllManagedListItems();

  return (
    <DataTable<InputRelevance>
      data={list}
      title="Input Relevance"
      columns={["input_def", "dimension", "is_relevant"]}
      createFormProps={{
        formAction: CreateInputRelevance,
        fields: [
          {
            key: "input_def_id",
            type: "select",
            selectList: inputs.map((i) => ({
              label: i.name,
              value: i.id,
            })),
          },
          {
            key: "dimension_id",
            type: "select",
            selectList: ml.map((i) => ({
              label: i.name,
              value: i.id,
            })),
          },
          {
            key: "is_relevant",
            type: "select",
            selectList: [
              {
                label: "Relevant",
                value: "true",
              },
              {
                label: "Not Relevant",
                value: "false",
              },
            ],
          },
        ],
      }}
      updateFormProps={{
        formAction: UpdateInputRelevance,
        fields: [
          {
            key: "dimension_id",
            type: "select",
            selectList: ml.map((i) => ({
              label: i.name,
              value: i.id,
            })),
          },
          {
            key: "is_relevant",
            type: "select",
            selectList: [
              {
                label: "true",
                value: "true",
              },
              {
                label: "false",
                value: "false",
              },
            ],
          },
        ],
      }}
    />
  );
}
