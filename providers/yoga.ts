import type { FxRate } from "@/lib/types";
import type { RateProvider } from "./provider";

const SOURCE_URL = "https://yogatheplace.com/exchange-rate";

function decodeHtml(value: string) {
  return value
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#x27;/gi, "'")
    .replace(/&#39;/gi, "'")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&");
}

function stripHtml(value: string) {
  return value
    .replace(/<img[^>]*>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseNumber(value: string) {
  const cleaned = value.replace(/[^0-9.-]/g, "");
  const number = Number(cleaned);

  return Number.isFinite(number) ? number : null;
}

function extractUsdRate(html: string) {
  /*
   * Yoga's GoDaddy page embeds the actual exchange-rate
   * table inside an iframe srcDoc value.
   *
   * Decode the HTML entities so the embedded <tr>/<td>
   * markup becomes normal HTML.
   */
  const decoded = decodeHtml(html);

  const rows = [...decoded.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];

  for (const match of rows) {
    const rowHtml = match[0];
    const rowText = stripHtml(rowHtml);

    /*
     * Example:
     *
     * USD 180.0001 183.6001
     */
    if (!/\bUSD\b/i.test(rowText)) {
      continue;
    }

    const cells = [...rowHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(
      (cell) => stripHtml(cell[1])
    );

    if (cells.length < 3) {
      continue;
    }

    const currencyCell = cells.findIndex((cell) => /\bUSD\b/i.test(cell));

    if (currencyCell === -1) {
      continue;
    }

    const buyText = cells[currencyCell + 1];
    const sellText = cells[currencyCell + 2];

    if (!buyText || !sellText) {
      continue;
    }

    const buy = parseNumber(buyText);
    const sell = parseNumber(sellText);

    if (buy === null || sell === null) {
      continue;
    }

    return {
      buy,
      sell
    };
  }

  throw new Error("Could not find Yoga Forex Bureau USD cash rate");
}

export const yogaProvider: RateProvider = {
  name: "Yoga Forex Bureau",
  slug: "yoga",
  sourceUrl: SOURCE_URL,

  async fetchRates(): Promise<FxRate[]> {
    const response = await fetch(SOURCE_URL, {
      cache: "no-store",
      headers: {
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "User-Agent":
          "Mozilla/5.0 (compatible; EthioFX/1.0; +https://ethiofx.com)"
      }
    });

    if (!response.ok) {
      throw new Error(`Yoga Forex Bureau returned HTTP ${response.status}`);
    }

    const html = await response.text();

    const { buy, sell } = extractUsdRate(html);

    /*
     * Safety validation.
     */
    if (
      !Number.isFinite(buy) ||
      !Number.isFinite(sell) ||
      buy <= 0 ||
      sell <= 0
    ) {
      throw new Error(
        `Yoga returned invalid USD rates: buy=${buy}, sell=${sell}`
      );
    }

    if (sell < buy) {
      throw new Error(`Yoga USD rates look invalid: buy=${buy}, sell=${sell}`);
    }

    /*
     * Prevent obviously corrupted extraction from entering
     * the database.
     */
    if (buy < 100 || buy > 300 || sell < 100 || sell > 300) {
      throw new Error(
        `Yoga USD rates are outside expected range: buy=${buy}, sell=${sell}`
      );
    }

    const spread = sell - buy;

    if (spread > 20) {
      throw new Error(
        `Yoga USD spread looks suspicious: buy=${buy}, sell=${sell}`
      );
    }

    const fetchedAt = new Date().toISOString();

    /*
     * The embedded Yoga table currently does not provide a
     * reliable effective date/time, so don't invent one.
     */
    const effectiveAt = null;

    return [
      {
        bank: "Yoga Forex Bureau",
        slug: "yoga",
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
