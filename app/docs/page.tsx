export default function DocsHomePage() {
  return (
    <div className="space-y-4">
      <section className="rounded-md border bg-muted/10 p-4 text-sm">
        <h1 className="text-base font-semibold">Custom KPI Review Workflow</h1>
        <p className="mt-1 text-muted-foreground">
          Submitters can create requests, DEV reviewers can decide
          (approve/reject/replace), override prior decisions with rationale, and
          promote approved requests from submitter-only to global visibility.
        </p>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-xs sm:text-sm">
          <li>POST /api/data-entry/custom-kpi/requests</li>
          <li>GET /api/data-entry/custom-kpi/requests</li>
          <li>POST /api/data-entry/custom-kpi/requests/:requestId/decision</li>
          <li>POST /api/data-entry/custom-kpi/requests/:requestId/promotion</li>
          <li>POST /api/data-entry/custom-kpi/email-retries</li>
        </ul>
      </section>

      <iframe
        src={"/glossary.pdf"}
        style={{ border: "none", height: "calc(100vh - 64px)", width: "100%" }}
      />
    </div>
  );
}
