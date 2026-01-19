import { LogIn } from "lucide-react";
import Image from "next/image";
import NavList from "./navList";
import { Session } from "better-auth";

interface NavItem {
  label: string;
  href: string;
}

export default async function TopNav(props: {
  session?: Session;
}) {
  const navList: NavItem[] = [
    { label: "Home", href: "/" },
    {
      label: "Dashboard",
      href: "/dashboard",
    },{
      label: "Data Entry", href: "/data-entry"
    },
    {
      label: "Settings", href: "/settings"
    },
    { label: "Docs", href: "/docs" },
  ];
  return (
    <nav className="bg-gray-800 text-sm flex justify-between text-white p-3">
      <a href="/">
        <Image
          src="/logo.png"
          alt="Logo"
          width={100}
          height={50}
        />
      </a>

      <NavList navList={navList} />

      {props.session ? (
        "Logged in"
      ) : (
        <a
          href="/auth"
          className="gap-2 flex items-center hover:text-amber-400"
        >
          <LogIn size={18} /> Sign In
        </a>
      )}
    </nav>
  );
}
