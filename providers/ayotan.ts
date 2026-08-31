import type { FxRate } from "@/lib/types";
import type { RateProvider } from "./provider";

const SOURCE_URL = "https://ayotanforextrading.com/";

function parseNumber(value: string) {
  const number = Number(value.replace(/,/g, "").trim());

  return Number.isFinite(number) ? number : null;
}

function extractEffectiveAt(html: string) {
  /*
   * Example heading:
   * August 31, 2026 Exchange Rate
   */
  const match = html.match(
    /([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})\s+Exchange\s+Rate/i
  );

  if (!match) {
    return null;
  }

  const parsed = new Date(
    `${match[1]} ${match[2]}, ${match[3]} 00:00:00 +03:00`
  );

  if (!Number.isFinite(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}

function extractUsdRate(html: string) {
  /*
   * Ayotan renders a normal HTML table.
   *
   * Example row:
   *
   * <span class="currency-name">USD</span>
   * <span class="rate-badge buying">179.0001</span>
   * <span class="rate-badge selling">182.5801</span>
   */

  const rows = html.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi);

  if (!rows) {
    throw new Error("Could not find Ayotan exchange-rate table");
  }

  const usdRow = rows.find((row) =>
    /<span[^>]*class=["'][^"']*currency-name[^"']*["'][^>]*>\s*USD\s*<\/span>/i.test(
      row
    )
  );

  if (!usdRow) {
    throw new Error("Could not find Ayotan USD table row");
  }

  const buyMatch = usdRow.match(
    /class=["'][^"']*rate-badge[^"']*buying[^"']*["'][^>]*>\s*([0-9]+(?:\.[0-9]+)?)\s*</i
  );

  const sellMatch = usdRow.match(
    /class=["'][^"']*rate-badge[^"']*selling[^"']*["'][^>]*>\s*([0-9]+(?:\.[0-9]+)?)\s*</i
  );

  if (!buyMatch || !sellMatch) {
    throw new Error("Could not parse Ayotan USD buy/sell rate");
  }

  const buy = parseNumber(buyMatch[1]);
  const sell = parseNumber(sellMatch[1]);

  if (buy === null || sell === null) {
    throw new Error("Could not parse Ayotan USD numeric values");
  }

  if (
    buy <= 0 ||
    sell <= 0 ||
    sell < buy ||
    buy < 100 ||
    buy > 300 ||
    sell < 100 ||
    sell > 300
  ) {
    throw new Error(
      `Ayotan USD rates look invalid: buy=${buy}, sell=${sell}`
    );
  }

  return {
    buy,
    sell
  };
}

export const ayotanProvider: RateProvider = {
  name: "Ayotan Forex Bureau",
  slug: "ayotan",
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
      throw new Error(
        `Ayotan Forex Bureau returned HTTP ${response.status}`
      );
    }

    const html = await response.text();

    const { buy, sell } = extractUsdRate(html);

    return [
      {
        bank: "Ayotan Forex Bureau",
        slug: "ayotan",
        currency: "USD",
        buy,
        sell,
        rateType: "cash",
        sourceUrl: SOURCE_URL,
        effectiveAt: extractEffectiveAt(html),
        fetchedAt: new Date().toISOString()
      }
    ];
  }
};