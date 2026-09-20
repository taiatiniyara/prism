"use client";

import { useEffect, useState } from "react";

export interface FetchState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

// One-shot GET-on-mount fetch, refetching if `url` changes. For pages that
// need an explicit refetch trigger (a filter, a manual refresh button), use
// useState/useCallback/useEffect directly instead — this hook has no
// escape hatch for that. Previously duplicated inline in
// app/settings/overview/page.tsx.
export function useFetch<T>(url: string): FetchState<T> {
  const [state, setState] = useState<FetchState<T>>({ data: null, loading: true, error: null });
  useEffect(() => {
    fetch(url)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data) => setState({ data, loading: false, error: null }))
      .catch((e) => setState({ data: null, loading: false, error: e.message }));
  }, [url]);
  return state;
}
