"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { FaList, FaChevronLeft, FaChevronRight } from "react-icons/fa";
import { cn } from "@/lib/utils";

const noSidebarPages = ["/", "/login", "/register", "/profile", "/docs"];

export default function Sidebar(props: {
  list: {
    name: string;
    page: string;
  }[];
}) {
  const path = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  if (noSidebarPages.includes(path)) return null;

  const filteredList = props.list.filter(
    (l) => l.page.split("/")[1] === path.split("/")[1],
  );

  return (
    <div
      className={cn(
        "relative flex flex-col border-r font-medium text-sm transition-all duration-300",
        collapsed ? "w-10" : "w-48 px-2 gap-1",
      )}
    >
      {/* Toggle button */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        className={cn(
          "absolute z-10 flex h-6 w-6 items-center justify-center rounded-full border bg-white shadow-sm",
          "hover:bg-slate-100 transition-colors",
          collapsed ? "right-2 top-3" : "-right-3 top-3",
        )}
      >
        {collapsed ? <FaChevronRight size={9} /> : <FaChevronLeft size={9} />}
      </button>

      {!collapsed && (
        <>
          <span className="text-xs flex font-black gap-2 text-slate-400 px-4 py-2 border-b mb-2 mt-0.5">
            <FaList size={15} /> MENU
          </span>
          {filteredList.map((item) => (
            <Link
              href={item.page}
              key={item.name}
              className={`${
                path === item.page
                  ? "bg-slate-200 font-bold"
                  : "hover:text-slate-400"
              } py-2 px-4 transition-colors rounded-md`}
            >
              {item.name}
            </Link>
          ))}
        </>
      )}
    </div>
  );
}
