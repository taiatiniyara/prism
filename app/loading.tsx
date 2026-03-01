import { BeatLoader as Loader } from "react-spinners";
export default function LoadingPage() {
  return (
    <div className="flex items-center justify-center h-screen">
      <Loader color="#36d7b7" />
    </div>
  );
}
