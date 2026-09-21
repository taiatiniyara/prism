// Closes any open custom-KPI-request <details> panels elsewhere on the page
// (e.g. sibling request cards) after an action completes. These panels are
// uncontrolled, so there's no React state to reset — this is a deliberate,
// narrowly-scoped escape hatch rather than something refs could replace.
export function collapseExpandedCustomKpiRequests() {
  if (typeof document === "undefined") {
    return;
  }

  const expandedRequests = document.querySelectorAll<HTMLDetailsElement>(
    'details[data-custom-kpi-request-details="true"][open]',
  );
  expandedRequests.forEach((panel) => {
    panel.open = false;
  });
}
