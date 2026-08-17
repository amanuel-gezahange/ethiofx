import { FxRate } from "./types";

/**
 * DEMO DATA ONLY.
 * Used only until Supabase is configured.
 */
export const rates: FxRate[] = [
  ["Commercial Bank of Ethiopia", "cbe", 160.10, 163.25, "https://combanketh.et/exchange-rates?srcPage=home"],
  ["Awash Bank", "awash", 160.85, 163.10, "https://www.awashbank.com/"],
  ["Dashen Bank", "dashen", 161.05, 163.40, "https://dashenbanksc.com/"],
  ["Bank of Abyssinia", "abyssinia", 160.95, 163.30, "https://www.bankofabyssinia.com/"],
  ["Zemen Bank", "zemen", 160.55, 163.05, "https://zemenbank.com/"]
].map(([bank, slug, buy, sell, sourceUrl]) => ({
  bank: bank as string,
  slug: slug as string,
  currency: "USD",
  buy: buy as number,
  sell: sell as number,
  rateType: "transaction" as const,
  sourceUrl: sourceUrl as string,
  fetchedAt: new Date().toISOString()
}));

export function getRates(currency = "USD") {
  return rates.filter((r) => r.currency === currency);
}
