import { PuffLoader as Loader } from "react-spinners";

export default function LoadingEnterDataPage() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <Loader color="#fbbf24" />
    </div>
  );
}
