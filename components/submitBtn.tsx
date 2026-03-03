import React from "react";
import { Button } from "./ui/button";
import { useFormStatus } from "react-dom";
import Loader from "react-spinners/ClipLoader";

export default function SubmitBtn(props: { text?: string | React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <Button
      className="min-w-24 px-4 gap-2 cursor-pointer"
      disabled={pending}
    >
      {pending ? (
        <Loader
          color="#FFFFFF"
          size={15}
        />
      ) : (
        <>{props.text}</>
      )}
    </Button>
  );
}
