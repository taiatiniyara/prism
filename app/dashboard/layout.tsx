import React from "react";

export default function DashboardLayoutpage({
  children,
}: {
  children: React.ReactNode;
}) {
  // dashboard layout does not need user data; keep it static to avoid blocking
  return <div>{children}</div>;
}
