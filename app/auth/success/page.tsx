import { FaRegEnvelopeOpen } from "react-icons/fa";

export default function AuthSuccessPage() {
  return (
    <div className="flex justify-center flex-col items-center text-success p-8 gap-4">
      <FaRegEnvelopeOpen size={70} />
      <p className="p-6 bg-success/10 rounded-lg border border-success/40 font-medium w-[400px]">
        A login link has been sent to your email to verify your identity. Click
        on the link to login. If you have not received the link, please check
        your <u>spam</u> or <u>junk</u> folder.
      </p>
    </div>
  );
}
