"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const noSidebarPages = ["/", "/dashboard", "/login", "/register", "/profile"];

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
      {props.list
        .filter((l) => l.page.split("/")[1] === path.split("/")[1])
        .map((item) => (
          <Link
            href={item.page}
            key={item.name}
            className={`${path === item.page ? "bg-slate-200 font-bold" : "hover:text-slate-400"} py-3 px-4 transition-colors rounded-md`}
          >
            {item.name}
          </Link>
        ))}
    </div>
  );
}
