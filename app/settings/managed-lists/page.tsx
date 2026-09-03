import { GetAllManagedListItems, GetAllManagedLists } from "./service";
import ManagedListsEditor from "./managed-lists-editor";

export default async function ManagedListSettingsPage() {
  const lists = await GetAllManagedLists();
  const items = await GetAllManagedListItems();
  return (
    <div className="h-full">
      <ManagedListsEditor
        lists={lists}
        items={items}
      />
    </div>
  );
}
