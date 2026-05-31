const EXCHANGE_RATE_API = "https://open.er-api.com/v6/latest/USD";

interface RatesCache {
  rates: Record<string, number>;
  fetchedAt: number;
}

let cache: RatesCache | null = null;
const CACHE_TTL_MS = 60 * 60 * 1000;

async function fetchRates(): Promise<Record<string, number>> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.rates;
  }

  try {
    const response = await fetch(EXCHANGE_RATE_API);
    if (!response.ok) throw new Error("Exchange rate API failed");
    const data = (await response.json()) as { rates: Record<string, number> };
    cache = { rates: data.rates, fetchedAt: Date.now() };
    return data.rates;
  } catch {
    if (cache) return cache.rates;
    return {};
  }
}

export async function getExchangeRate(
  currencyCode: string,
): Promise<number> {
  const rates = await fetchRates();
  const upper = currencyCode.toUpperCase();
  if (upper === "USD") return 1;
  return rates[upper] ?? null;
}

export async function getAllExchangeRates(): Promise<Record<string, number>> {
  return fetchRates();
}

export async function convertToUsd(
  value: number,
  currencyCode: string,
): Promise<number | null> {
  const rate = await getExchangeRate(currencyCode);
  if (rate == null) return null;
  return value / rate;
}
