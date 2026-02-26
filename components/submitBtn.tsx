import { Button } from "./ui/button";
import { useFormStatus } from "react-dom";
import Loader from "react-spinners/ClipLoader";

export default function SubmitBtn(props: { text?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button
      className="min-w-24"
      disabled={pending}
    >
      {pending ? (
        <Loader
          color="#FFFFFF"
          size={15}
        />
      ) : (
        props.text || "Submit"
      )}
    </Button>
  );
}
