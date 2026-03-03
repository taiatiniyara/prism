"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FaList } from "react-icons/fa";

const noSidebarPages = [
  "/",
  "/dashboard",
  "/login",
  "/register",
  "/profile",
  "/docs",
];

export default function Sidebar(props: {
  list: {
    name: string;
    page: string;
  }[];
}) {
  const path = usePathname();
  if (noSidebarPages.includes(path)) return null;

  return (
    <div className="p-2 flex flex-col border-r gap-1 font-medium text-sm">
      <span className="text-xs flex font-black gap-2 text-slate-400 px-4 py-2 border-b mb-2">
        <FaList size={15} /> MENU
      </span>
      {props.list
        .filter((l) => l.page.split("/")[1] === path.split("/")[1])
        .map((item) => (
          <Link
            href={item.page}
            key={item.name}
            className={`${path === item.page ? "bg-slate-200 font-bold" : "hover:text-slate-400"} py-2 px-4 transition-colors rounded-md`}
          >
            {item.name}
          </Link>
        ))}
    </div>
  );
}
