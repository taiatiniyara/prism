import "dotenv/config";
import { GET as dimCountry } from "@/app/api/dimCountry/route";
import { GET as factCurrency } from "@/app/api/factCurrency/route";
import { GET as factDistribution } from "@/app/api/factDistribution/route";
import { GET as factFinancialAccounts } from "@/app/api/factFinancialAccounts/route";
import { GET as factGovernance } from "@/app/api/factGovernance/route";
import { GET as factMetering } from "@/app/api/factMetering/route";
import { GET as factSafety } from "@/app/api/factSafety/route";
import { GET as factSaidiAndSaifi } from "@/app/api/factSaidiAndSaifi/route";
import { GET as factTariffStructure } from "@/app/api/factTariffStructure/route";
import { GET as factTransmission } from "@/app/api/factTransmission/route";
import { GET as factUtilityCosts } from "@/app/api/factUtilityCosts/route";
import { GET as factGeneratorData } from "@/app/api/factGeneratorData/route";
import { GET as dimGenerators } from "@/app/api/dimGenerators/route";
import { GET as factCountryContextData } from "@/app/api/factCountryContextData/route";
import { GET as factUtilityContextData } from "@/app/api/factUtilityContextData/route";

const API_KEY = process.env.API_KEY;

function req() {
  return new Request("http://localhost/api", {
    headers: { Authorization: API_KEY ?? "" },
  });
}

function countNonNull(rows: any[], key: string): number {
  return rows.filter((r) => r[key] != null && r[key] !== "").length;
}

function distinct(rows: any[], key: string): unknown[] {
  return [...new Set(rows.map((r) => r[key]))].filter(
    (v) => v != null && v !== "",
  );
}

async function run(name: string, handler: (r: Request) => Promise<Response>) {
  const res = await handler(req());
  if (res.status !== 200) {
    console.log(`\n=== ${name} ===  HTTP ${res.status}  ${await res.text()}`);
    return [];
  }
  return (await res.json()) as any[];
}

async function main() {
  if (!API_KEY) {
    console.error("API_KEY not set in .env");
    process.exit(1);
  }

  // dimCountry
  {
    const rows = await run("Dim Country", dimCountry);
    const fr = rows.map((r) => r["Fuel Regulation"]).filter((v) => v != null);
    const bad = fr.filter((v) => v === "890" || v === "892" || v === 890 || v === 892);
    console.log(
      `Dim Country: ${rows.length} rows | Fuel Regulation distinct=${JSON.stringify([...new Set(fr)].slice(0, 8))} | still-raw-id count=${bad.length}`,
    );
  }

  // factCurrency
  {
    const rows = await run("Fact Currency", factCurrency);
    const codes = distinct(rows, "CurrencyCode");
    const bad = codes.filter((c) => !/^[A-Z]{3}$/.test(String(c)));
    console.log(
      `Fact Currency: ${rows.length} rows | CurrencyCode distinct=${JSON.stringify(codes.slice(0, 10))} | non-ISO count=${bad.length}`,
    );
  }

  // factDistribution
  {
    const rows = await run("Fact Distribution", factDistribution);
    const data = rows.flatMap((r) => (r.Data ?? []) as any[]);
    const len = countNonNull(data, "Distribution Network Length");
    const cap = countNonNull(data, "Distribution Network Transformer Capacity");
    const dow = countNonNull(data, "Distribution Network Unplanned Downtime Events");
    console.log(
      `Fact Distribution: ${rows.length} rp | data rows=${data.length} | Network Length=${len} | Transformer Capacity=${cap} | Unplanned Downtime Events=${dow}`,
    );
  }

  // factFinancialAccounts
  {
    const rows = await run("Fact Financial Accounts", factFinancialAccounts);
    const am = countNonNull(rows, "Amortization Expense");
    const it = countNonNull(rows, "Income Taxes");
    console.log(
      `Fact Financial Accounts: ${rows.length} rows | Amortization Expense=${am} | Income Taxes=${it}`,
    );
  }

  // factGovernance
  {
    const rows = await run("Fact Governance", factGovernance);
    let tru = 0, fls = 0, nul = 0;
    const keys = new Set<string>();
    for (const r of rows) {
      for (const [k, v] of Object.entries(r)) {
        if (k.startsWith("Is ") || k.startsWith("Are ") || k.startsWith("Does ") || k.startsWith("Has ")) {
          keys.add(k);
          if (v === true) tru++;
          else if (v === false) fls++;
          else nul++;
        }
      }
    }
    console.log(
      `Fact Governance: ${rows.length} rows | ${keys.size} q-cols | true=${tru} false=${fls} null=${nul}`,
    );
  }

  // factMetering
  {
    const rows = await run("Fact Metering", factMetering);
    const data = rows.flatMap((r) => (r.Data ?? []) as any[]);
    const ec = countNonNull(data, "Electricity Customers");
    const es = countNonNull(data, "Electricity Sold to Customers");
    console.log(
      `Fact Metering: ${rows.length} rp | Electricity Customers=${ec} | Electricity Sold to Customers=${es}`,
    );
  }

  // factSafety
  {
    const rows = await run("Fact Safety", factSafety);
    const hl = countNonNull(rows, "Hours Lost to Work Related Injuries");
    const tw = countNonNull(rows, "Total Hours Worked");
    console.log(
      `Fact Safety: ${rows.length} rows | Hours Lost to Work Related Injuries=${hl} | Total Hours Worked=${tw}`,
    );
  }

  // factSaidiAndSaifi
  {
    const rows = await run("Fact SAIDI&SAIFI", factSaidiAndSaifi);
    const data = rows.flatMap((r) => (r.Data ?? []) as any[]);
    const a = countNonNull(data, "Total Unplanned Interruptions Customers Affected");
    const b = countNonNull(data, "Total Unplanned Interruptions Events");
    const c = countNonNull(data, "Total Planned Interruptions Customer Minutes");
    const d = countNonNull(data, "Total Planned Interruptions Customers Affected");
    console.log(
      `Fact SAIDI&SAIFI: data rows=${data.length} | Unplanned CustomersAffected=${a} | Unplanned Events=${b} | Planned CustomerMinutes=${c} | Planned CustomersAffected=${d}`,
    );
  }

  // factTariffStructure
  {
    const rows = await run("Fact Tariff Structure", factTariffStructure);
    const data = rows.flatMap((r) => (r.Data ?? []) as any[]);
    const nz = data.filter((d) =>
      Object.entries(d).some(
        ([k, v]) => !["ServiceAreaId", "Unit", "Multiplier"].includes(k) && v != null && v !== 0,
      ),
    ).length;
    console.log(`Fact Tariff Structure: ${rows.length} rp | data rows=${data.length} | rows with any value=${nz}`);
  }

  // factTransmission
  {
    const rows = await run("Fact Transmission", factTransmission);
    const data = rows.flatMap((r) => (r.Data ?? []) as any[]);
    const len = countNonNull(data, "Transmission Network Length");
    const cs = countNonNull(data, "Transmission Network Customers Served");
    const es = countNonNull(data, "Transmission Electricity Sold to Customers");
    const fte = countNonNull(data, "FTE Employees in Transmission");
    console.log(
      `Fact Transmission: data rows=${data.length} | Network Length=${len} | Customers Served=${cs} | Electricity Sold=${es} | FTE=${fte}`,
    );
  }

  // factUtilityCosts
  {
    const rows = await run("Fact Utility Costs", factUtilityCosts);
    const staff = countNonNull(rows, "Direct Costs: Electricity Staff");
    const om = countNonNull(rows, "Direct Costs: Electricity O&M");
    const fuel = countNonNull(rows, "Apportioned Cost: Fuel & Oil Expenditure");
    console.log(
      `Fact Utility Costs: ${rows.length} rows | Direct Electricity Staff=${staff} | Direct Electricity O&M=${om} | Apportioned Fuel&Oil=${fuel}`,
    );
  }

  // factGeneratorData
  {
    const rows = await run("Fact Generator Data", factGeneratorData);
    const data = rows.flatMap((r) => (r["Generator Data"] ?? []) as any[]);
    const cap = countNonNull(data, "GEN Installed Capacity");
    const oil = countNonNull(data, "Oil for Lubrication");
    const diesel = countNonNull(data, "Fuel Oil for Diesel Generators");
    const hfo = countNonNull(data, "Fuel Oil for Heavy Fuel Generators");
    const gen = countNonNull(data, "GEN Electricity Generated");
    const down = countNonNull(data, "GEN Downtime Planned Hours");
    console.log(
      `Fact Generator Data: gen rows=${data.length} | Installed Capacity=${cap} | Oil for Lubrication=${oil} | FuelOil Diesel=${diesel} | FuelOil HFO=${hfo} | Electricity Generated=${gen} | Downtime Planned Hours=${down}`,
    );
  }

  // dimGenerators
  {
    const rows = await run("Dim Generators", dimGenerators);
    const ps = countNonNull(rows, "Power Station ID");
    console.log(`Dim Generators: ${rows.length} rows | Power Station ID populated=${ps}`);
  }

  // factCountryContextData
  {
    const rows = await run("Fact Country Context", factCountryContextData);
    const cid = countNonNull(rows, "CountryId");
    const a2 = countNonNull(rows, "AlphaCode2");
    const a3 = countNonNull(rows, "AlphaCode3");
    const uid = countNonNull(rows, "UtilityId");
    console.log(
      `Fact Country Context: ${rows.length} rows | CountryId=${cid} | AlphaCode2=${a2} | AlphaCode3=${a3} | UtilityId=${uid}`,
    );
  }

  // factUtilityContextData
  {
    const rows = await run("Fact Utility Context", factUtilityContextData);
    const own = countNonNull(rows, "Ownership Type");
    console.log(`Fact Utility Context: ${rows.length} rows | Ownership Type=${own}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("FAILED:", (e as Error).message);
    process.exit(1);
  });
