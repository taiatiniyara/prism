type OrganisationOption = {
  id: number;
  name: string;
  acronym: string | null;
};

type PivotRow = {
  id: string;
  label: string;
  values: Array<{
    organisationId: number;
    count: number;
  }>;
};

export default function DevOrganisationRelevancePivotTable(props: {
  organisations: OrganisationOption[];
  rows: PivotRow[];
}) {
  if (props.organisations.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No active utility organisations are available.
      </p>
    );
  }

  if (props.rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No organisation relevance rows are available.
      </p>
    );
  }

  const totalByOrganisationId = new Map<number, number>();
  for (const row of props.rows) {
    for (const value of row.values) {
      totalByOrganisationId.set(
        value.organisationId,
        (totalByOrganisationId.get(value.organisationId) ?? 0) + value.count,
      );
    }
  }

  return (
    <div className="max-h-[70vh] overflow-auto border">
      <table className="w-max min-w-full border-collapse text-xs">
        <thead>
          <tr className="bg-muted/30">
            <th className="sticky left-0 top-0 z-40 min-w-72 border bg-muted px-3 py-2 text-left text-xs font-semibold whitespace-nowrap">
              Relevance Area
            </th>
            {props.organisations.map((organisation) => (
              <th
                key={organisation.id}
                className="sticky top-0 z-30 min-w-28 border bg-muted px-3 py-2 text-left text-xs font-semibold whitespace-nowrap"
                title={organisation.name}
              >
                {organisation.acronym || organisation.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {props.rows.map((row) => {
            const countByOrganisationId = new Map(
              row.values.map((value) => [value.organisationId, value.count]),
            );

            return (
              <tr key={row.id}>
                <td className="sticky left-0 z-20 border bg-background px-3 py-2 text-xs font-medium align-top">
                  {row.label}
                </td>
                {props.organisations.map((organisation) => {
                  const count = countByOrganisationId.get(organisation.id) ?? 0;
                  const isNonZero = count > 0;

                  return (
                    <td
                      key={`${row.id}-${organisation.id}`}
                      className={
                        isNonZero
                          ? "border bg-success/10 px-3 py-2 text-center text-xs"
                          : "border px-3 py-2 text-center text-xs"
                      }
                    >
                      <span
                        className={
                          isNonZero
                            ? "font-semibold text-success"
                            : "font-semibold text-muted-foreground"
                        }
                      >
                        {count}
                      </span>
                    </td>
                  );
                })}
              </tr>
            );
          })}
          <tr className="bg-muted/20">
            <td className="sticky left-0 z-20 border bg-background px-3 py-2 text-xs font-semibold align-top">
              Total (all relevance areas)
            </td>
            {props.organisations.map((organisation) => {
              const total = totalByOrganisationId.get(organisation.id) ?? 0;
              const isNonZero = total > 0;

              return (
                <td
                  key={`total-${organisation.id}`}
                  className={
                    isNonZero
                      ? "border bg-success/10 px-3 py-2 text-center text-xs"
                      : "border px-3 py-2 text-center text-xs"
                  }
                >
                  <span
                    className={
                      isNonZero
                        ? "font-semibold text-success"
                        : "font-semibold text-muted-foreground"
                    }
                  >
                    {total}
                  </span>
                </td>
              );
            })}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
