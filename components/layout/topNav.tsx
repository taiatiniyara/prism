"use client";

import { LogIn, Menu, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import NavList from "./navList";
import { Session } from "better-auth";
import UserDropdown from "./userDropdown";
import { useState } from "react";

interface NavItem {
  label: string;
  href: string;
}

export default function TopNav(props: {
  session?: Session;
  role?: string;
  orgAcronym?: string;
  fullName?: string;
}) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const navList: NavItem[] = [
    { label: "Home", href: "/" },
    {
      label: "Dashboard",
      href: "/dashboard",
    },
    {
      label: "PRISM AI",
      href: "/prism-ai",
    },
    {
      label: "Data Entry",
      href: "/data-entry",
    },
    {
      label: "Settings",
      href: "/settings/users",
    },
    { label: "Docs", href: "/docs" },
  ];

  const handleToggleMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  return (
    <nav className="sticky text-sm font-medium top-0 z-50 bg-linear-to-r from-slate-900 via-slate-800 to-slate-700 text-white">
      {/* Main Top Bar */}
      <div className="flex justify-between items-center p-3 relative z-20 bg-transparent">
        <div className="flex items-center gap-16">
          <Link href="/">
            <Image
              src="/logo.png"
              alt="Logo"
              width={100}
              height={50}
            />
          </Link>
          <NavList
            navList={navList}
            className="flex-row gap-8 items-center"
          />
        </div>

        <div className="flex items-center gap-4">
          {/* Auth / Profile Area */}
          <div className="hidden md:flex">
            {props.session ? (
              <UserDropdown
                orgAcronym={props.orgAcronym}
                role={props.role}
                fullName={props.fullName}
              />
            ) : (
              <Link
                href="/auth"
                className="gap-2 flex items-center hover:text-slate-400"
              >
                <LogIn size={18} /> Login
              </Link>
            )}
          </div>

          {/* Mobile Menu Toggle Button */}
          <button
            className="md:hidden p-2 text-slate-300 hover:text-white focus:outline-none"
            onClick={handleToggleMenu}
            aria-label="Toggle mobile menu"
          >
            {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      {/* Mobile Slide-down Menu */}
      {isMobileMenuOpen && (
        <div className="md:hidden bg-slate-700 border-t border-slate-600 animate-in slide-in-from-top-2 duration-200">
          <div className="max-w-7xl mx-auto px-4 pt-2 pb-4 space-y-4">
            <NavList
              navList={navList}
              className="flex-col gap-4 text-base"
            />

            <div className="pt-4 border-t border-slate-600">
              {props.session ? (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <UserDropdown />
                    <span className="bg-amber-400 text-slate-900 px-2 py-1 rounded font-medium text-xs">
                      {props.role}
                    </span>
                  </div>
                </div>
              ) : (
                <Link
                  href="/auth"
                  className="flex items-center gap-2 hover:text-slate-400 py-2"
                >
                  <LogIn size={20} /> Login
                </Link>
              )}
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
