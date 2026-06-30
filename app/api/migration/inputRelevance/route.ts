import { assertMigrationKey } from "../prism-training/_lib";
import { db } from "@/db/connection";
import { inputRelevance,  inputDefinitions, managedListItems} from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(request: Request) {
    assertMigrationKey(request);
    const ir = await db.select().from(inputRelevance).leftJoin(inputDefinitions, eq(inputRelevance.input_def_id, inputDefinitions.id)).leftJoin(managedListItems, eq(inputRelevance.dimension_id, managedListItems.id));

    return Response.json(ir.map(i => {
        return {
            id: i.input_relevance.id,
            inputDefinitionId: i.input_definitions?.id,
            inputDefinition: i.input_definitions?.name,
            dimensionId: i.managed_list_items?.id,
            dimension: i.managed_list_items?.name,
            isRelevant: i.input_relevance.is_relevant
        }
    }))
}