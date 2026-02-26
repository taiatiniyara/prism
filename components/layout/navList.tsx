"use client";

import { usePathname } from "next/navigation";

export default function NavList(props: {
  navList: { label: string; href: string }[];
  className?: string;
}) {
  const pathname = usePathname();

  return (
    <div className={`flex ${props.className || "gap-6"}`}>
      {props.navList.map((item) => (
        <a
          key={item.href}
          href={item.href}
          className={
            pathname === item.href ? "text-amber-400" : "hover:text-slate-400"
          }
        >
          {item.label}
        </a>
      ))}
    </div>
  );
}
