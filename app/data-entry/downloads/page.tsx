import { GetDownloadData } from "./service";
import DownloadButton from "./download-button";
import { Heading } from "@/components/heading";

export default async function DownloadsPage() {
  const data = await GetDownloadData();

  return (
    <div className="space-y-4 p-4">
      <Heading level={5} className="font-bold">
        Download Inputs
      </Heading>
      <DownloadButton data={data} />
    </div>
  );
}
