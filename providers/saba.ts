import type { FxRate } from "@/lib/types";
import type { RateProvider } from "./provider";

const SOURCE_URL = "https://sabaforex.com/exchange-rate/";

function parseNumber(value: string) {
  const number = Number(
    value
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/gi, " ")
      .replace(/,/g, "")
      .trim()
  );

  return Number.isFinite(number) ? number : null;
}

function extractEffectiveAt(html: string) {
  // Example:
  // AUGUST 24, 2026 Exchange Rate
  const match = html.match(
    /([A-Z]+)\s+(\d{1,2}),\s+(\d{4})\s+Exchange\s+Rate/i
  );

  if (!match) {
    return null;
  }

  const timestamp = new Date(
    `${match[1]} ${match[2]}, ${match[3]} 00:00:00 +03:00`
  );

  return Number.isFinite(timestamp.getTime()) ? timestamp.toISOString() : null;
}

function extractUsdRate(html: string) {
  /*
   * Saba uses a normal server-rendered TablePress table.
   * Locate the <tr> containing USD and extract the
   * Cash Buying / Cash Selling values.
   */
  const rows = html.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) ?? [];

  const usdRow = rows.find((row) => /<strong>\s*USD\s*<\/strong>/i.test(row));

  if (!usdRow) {
    throw new Error("Could not find Saba USD exchange-rate row");
  }

  const cells = usdRow.match(/<td\b[^>]*>[\s\S]*?<\/td>/gi) ?? [];

  if (cells.length < 4) {
    throw new Error(
      `Unexpected Saba USD row structure: found ${cells.length} cells`
    );
  }

  // columns:
  // 0 = flag
  // 1 = currency
  // 2 = Cash Buying
  // 3 = Cash Selling
  const buy = parseNumber(cells[2]);
  const sell = parseNumber(cells[3]);

  if (buy === null || sell === null) {
    throw new Error("Could not parse Saba USD buy/sell rate");
  }

  if (buy <= 0 || sell <= 0 || sell < buy) {
    throw new Error(`Saba USD rates look invalid: buy=${buy}, sell=${sell}`);
  }

  return { buy, sell };
}

export const sabaProvider: RateProvider = {
  name: "Saba Forex",
  slug: "saba",
  sourceUrl: SOURCE_URL,

  async fetchRates(): Promise<FxRate[]> {
    const response = await fetch(SOURCE_URL, {
      cache: "no-store",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; EthioFX/1.0; +https://ethiofx.com)",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      }
    });

    if (!response.ok) {
      throw new Error(`Saba returned HTTP ${response.status}`);
    }

    const html = await response.text();

    const { buy, sell } = extractUsdRate(html);

    const fetchedAt = new Date().toISOString();
    const effectiveAt = extractEffectiveAt(html);

    return [
      {
        bank: "Saba Forex",
        slug: "saba",
        currency: "USD",
        buy,
        sell,
        rateType: "cash",
        sourceUrl: SOURCE_URL,
        effectiveAt,
        fetchedAt
      }
    ];
  }
};
