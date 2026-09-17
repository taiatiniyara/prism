"use client";

import { useCallback, useState } from "react";

// Shared expand/collapse-row toggle (Set<id> of expanded rows), previously
// hand-rolled identically in app/settings/logs/audit + errors pages.
export function useToggleSet<T>() {
  const [expanded, setExpanded] = useState<Set<T>>(new Set());

  const toggle = useCallback((id: T) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  return { expanded, toggle };
}
