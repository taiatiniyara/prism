import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function RelevanceSettingsPage() {
  return (
    <div>
      <Tabs defaultValue="tariff">
        <TabsList>
          <TabsTrigger value="tariff">Tariff</TabsTrigger>
          <TabsTrigger value="transmission">Transmission</TabsTrigger>
          <TabsTrigger value="custom-kpi-relevance">
            Custom KPI Relevance
          </TabsTrigger>
        </TabsList>
        <TabsContent value="tariff">
          Make changes to your tariff here.
        </TabsContent>
        <TabsContent value="transmission">
          Change your transmission settings here.
        </TabsContent>
        <TabsContent value="custom-kpi-relevance">
          Adjust your custom KPI relevance settings here.
        </TabsContent>
      </Tabs>
    </div>
  );
}
