"use client";

import { useEffect, useMemo, useState } from "react";

export function cssVarToColor(varName: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  return value || fallback;
}

export interface ChartTheme {
  isDark: boolean;
  textColor: string;
  mutedColor: string;
  primaryColor: string;
  gridColor: string;
  tooltipBg: string;
  tooltipText: string;
  tooltipBorder: string;
}

export function useChartTheme(): ChartTheme {
  const [isDark, setIsDark] = useState<boolean>(() => {
    if (typeof document === "undefined") return false;
    return document.documentElement.classList.contains("dark");
  });

  useEffect(() => {
    const el = document.documentElement;
    const observer = new MutationObserver(() => {
      setIsDark(el.classList.contains("dark"));
    });
    observer.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return useMemo<ChartTheme>(
    () => ({
      isDark,
      textColor: cssVarToColor("--foreground", isDark ? "#e2e8f0" : "#0f172a"),
      mutedColor: cssVarToColor("--muted-foreground", isDark ? "#94a3b8" : "#64748b"),
      primaryColor: cssVarToColor("--primary", isDark ? "#6366f1" : "#4f46e5"),
      gridColor: cssVarToColor("--border", isDark ? "#334155" : "#e2e8f0"),
      tooltipBg: cssVarToColor("--popover", isDark ? "#1e293b" : "#ffffff"),
      tooltipText: cssVarToColor("--popover-foreground", isDark ? "#e2e8f0" : "#0f172a"),
      tooltipBorder: cssVarToColor("--border", isDark ? "#334155" : "#e2e8f0"),
    }),
    [isDark],
  );
}