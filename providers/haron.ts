import type { FxRate } from "@/lib/types";
import type { RateProvider } from "./provider";

const SOURCE_URL = "https://www.haronforex.com/exchange-rates";

function parseNumber(value: string) {
  const number = Number(value.replace(/,/g, "").trim());

  return Number.isFinite(number) ? number : null;
}

function extractLastUpdated(html: string) {
  const match = html.match(
    /Last\s+updated:\s*(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})/i
  );

  if (!match) {
    return null;
  }

  /*
   * Haron's displayed timestamp does not include an explicit
   * timezone in the page text, so we preserve it as an
   * Ethiopia-local timestamp (+03:00).
   */
  const iso = `${match[1]}T${match[2]}+03:00`;

  const timestamp = new Date(iso);

  if (!Number.isFinite(timestamp.getTime())) {
    return null;
  }

  return timestamp.toISOString();
}

function extractUsdRate(html: string) {
  /*
   * Haron renders a normal HTML table.
   * Find the row containing USD, strip tags, then read
   * the first two numbers after USD as Buy and Sell.
   */

  const rowMatch = html.match(/<tr\b[^>]*>[\s\S]*?\bUSD\b[\s\S]*?<\/tr>/i);

  if (!rowMatch) {
    throw new Error("Could not find Haron USD table row");
  }

  const rowText = rowMatch[0]
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#160;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  const usdMatch = rowText.match(
    /\bUSD\b\s+([0-9]+(?:\.[0-9]+)?)\s+([0-9]+(?:\.[0-9]+)?)/i
  );

  if (!usdMatch) {
    throw new Error(`Could not parse Haron USD row: ${rowText}`);
  }

  const buy = parseNumber(usdMatch[1]);
  const sell = parseNumber(usdMatch[2]);

  if (buy === null || sell === null) {
    throw new Error("Could not parse Haron USD buy/sell rate");
  }

  if (buy <= 0 || sell <= 0 || sell < buy) {
    throw new Error(`Haron USD rates look invalid: buy=${buy}, sell=${sell}`);
  }

  return {
    buy,
    sell
  };
}

export const haronProvider: RateProvider = {
  name: "Haron Forex Bureau",
  slug: "haron",
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
      throw new Error(`Haron returned HTTP ${response.status}`);
    }

    const html = await response.text();

    const { buy, sell } = extractUsdRate(html);

    const fetchedAt = new Date().toISOString();
    const effectiveAt = extractLastUpdated(html);

    return [
      {
        bank: "Haron Forex Bureau",
        slug: "haron",
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
