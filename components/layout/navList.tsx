"use client";

import { usePathname } from "next/navigation";

export default function NavList(props: {
  navList: { label: string; href: string }[];
}) {
  const pathname = usePathname();

  return (
    <div className="flex gap-6">
      {props.navList.map((item) => (
        <a
          key={item.href}
          href={item.href}
          className={
            pathname === item.href
              ? "text-amber-400"
              : "hover:text-amber-400"
          }
        >
          {item.label}
        </a>
      ))}
    </div>
  );
}
