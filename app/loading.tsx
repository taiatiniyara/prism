import { PuffLoader as Loader } from "react-spinners";
export default function LoadingPage() {
  return (
    <div className="flex items-center justify-center h-screen">
      <Loader color="#fbbf24" />
    </div>
  );
}
