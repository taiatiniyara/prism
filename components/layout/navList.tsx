"use client";

import { usePathname } from "next/navigation";

export default function NavList(props: {
  navList: { label: string; href: string }[];
  className?: string;
}) {
  const pathname = usePathname();

  return (
    <div className={`flex text-sm ${props.className || "gap-6"}`}>
      {props.navList.map((item) => (
        <a
          key={item.href}
          href={item.href}
          className={`${
            pathname.split("/")[1] === item.href.split("/")[1]
              ? "text-amber-400 font-bold"
              : "hover:text-slate-400"
          } transition-colors`}
        >
          {item.label}
        </a>
      ))}
    </div>
  );
}
