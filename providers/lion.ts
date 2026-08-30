import type { FxRate } from "@/lib/types";
import type { RateProvider } from "./provider";

const SOURCE_URL = "https://anbesabank.com/";

/*
 * Lion / Anbesa Bank currently publishes the exchange-rate table
 * as a background image on the homepage rather than HTML/JSON.
 *
 * Current verified sheet:
 * https://anbesabank.com/wp-content/uploads/2026/08/August-28.jpg
 *
 * Verified USD rates from that sheet:
 *
 * CASH
 *   Buying  = 160.1068
 *   Selling = 163.3089
 *
 * TRANSACTION
 *   Buying  = 163.0586
 *   Selling = 166.3198
 *
 * IMPORTANT:
 * We dynamically discover the image URL.
 * If Lion changes to a new daily image, this provider intentionally
 * throws instead of silently returning yesterday's rates.
 */

type LionSheet = {
  imageUrl: string;
  effectiveAt: string;
  cashBuy: number;
  cashSell: number;
  transactionBuy: number;
  transactionSell: number;
};

async function fetchHomepage(): Promise<string> {
  const response = await fetch(SOURCE_URL, {
    cache: "no-store",
    headers: {
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36"
    }
  });

  if (!response.ok) {
    throw new Error(
      `Lion International Bank homepage returned HTTP ${response.status}`
    );
  }

  return response.text();
}

function extractRateImageUrl(html: string): string | null {
  /*
   * The current exchange-rate popup is Hustle module 15.
   *
   * Example:
   *
   * .hustle-ui.module_id_15 .hustle-layout {
   *   ...
   *   background-image:
   *     url(https://anbesabank.com/wp-content/uploads/2026/08/August-28.jpg);
   * }
   */

  const moduleMatch = html.match(
    /\.hustle-ui\.module_id_15\s+\.hustle-layout\s*\{[\s\S]*?background-image:\s*url\(([^)]+)\)/i
  );

  if (!moduleMatch?.[1]) {
    return null;
  }

  return moduleMatch[1]
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/&amp;/g, "&");
}

function monthNumber(monthName: string): number | null {
  const months: Record<string, number> = {
    january: 1,
    february: 2,
    march: 3,
    april: 4,
    may: 5,
    june: 6,
    july: 7,
    august: 8,
    september: 9,
    october: 10,
    november: 11,
    december: 12
  };

  return months[monthName.toLowerCase()] ?? null;
}

function extractEffectiveDateFromUrl(imageUrl: string): string | null {
  /*
   * Current naming:
   *
   * /2026/08/August-28.jpg
   *
   * We use the year from the upload path and
   * month/day from the filename.
   */

  const match = imageUrl.match(
    /\/(\d{4})\/\d{2}\/([A-Za-z]+)-(\d{1,2})(?:[-_.]|$)/i
  );

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = monthNumber(match[2]);
  const day = Number(match[3]);

  if (
    !Number.isInteger(year) ||
    month === null ||
    !Number.isInteger(day) ||
    day < 1 ||
    day > 31
  ) {
    return null;
  }

  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");

  /*
   * Treat the bank's published date as midnight Ethiopia time.
   */
  const parsed = new Date(`${year}-${mm}-${dd}T00:00:00+03:00`);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}

function getKnownSheet(imageUrl: string): LionSheet | null {
  /*
   * VERIFIED IMAGE:
   * August 28, 2026.
   *
   * We intentionally identify it by the image filename.
   * When Lion publishes another daily sheet, this will
   * stop rather than reuse stale values.
   */

  if (/\/2026\/08\/August-28\.jpg(?:\?.*)?$/i.test(imageUrl)) {
    const effectiveAt = extractEffectiveDateFromUrl(imageUrl);

    if (!effectiveAt) {
      return null;
    }

    return {
      imageUrl,
      effectiveAt,

      cashBuy: 160.1068,
      cashSell: 163.3089,

      transactionBuy: 163.0586,
      transactionSell: 166.3198
    };
  }

  return null;
}

function validPair(buy: number, sell: number): boolean {
  return (
    Number.isFinite(buy) &&
    Number.isFinite(sell) &&
    buy > 0 &&
    sell > 0 &&
    sell >= buy
  );
}

export class LionProvider implements RateProvider {
  readonly name = "Lion International Bank";

  readonly slug = "lion";

  readonly sourceUrl = SOURCE_URL;

  async fetchRates(): Promise<FxRate[]> {
    const html = await fetchHomepage();

    const imageUrl = extractRateImageUrl(html);

    if (!imageUrl) {
      throw new Error(
        "Lion International Bank homepage did not expose the exchange-rate image."
      );
    }

    console.log("[lion-image]", imageUrl);

    const sheet = getKnownSheet(imageUrl);

    if (!sheet) {
      throw new Error(
        `Lion International Bank published a new or unknown exchange-rate image: ${imageUrl}. ` +
          "Refusing to reuse previously verified rates."
      );
    }

    if (
      !validPair(sheet.cashBuy, sheet.cashSell) ||
      !validPair(sheet.transactionBuy, sheet.transactionSell)
    ) {
      throw new Error(
        "Lion International Bank verified USD rates are invalid."
      );
    }

    const fetchedAt = new Date().toISOString();

    const rates: FxRate[] = [
      {
        bank: this.name,
        slug: this.slug,
        currency: "USD",

        buy: sheet.cashBuy,
        sell: sheet.cashSell,

        rateType: "cash",

        sourceUrl: sheet.imageUrl,

        effectiveAt: sheet.effectiveAt,

        fetchedAt
      },

      {
        bank: this.name,
        slug: this.slug,
        currency: "USD",

        buy: sheet.transactionBuy,

        sell: sheet.transactionSell,

        rateType: "transaction",

        sourceUrl: sheet.imageUrl,

        effectiveAt: sheet.effectiveAt,

        fetchedAt
      }
    ];

    console.log("[lion-output]", {
      imageUrl: sheet.imageUrl,

      effectiveAt: sheet.effectiveAt,

      rates: rates.map((rate) => ({
        rateType: rate.rateType,

        buy: rate.buy,

        sell: rate.sell
      }))
    });

    return rates;
  }
}

export const lionProvider = new LionProvider();
