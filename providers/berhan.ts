import * as cheerio from "cheerio";

import type { FxRate } from "@/lib/types";
import type { RateProvider } from "./provider";

const SOURCE_URL = "https://berhanbanksc.com/exchange-rates/";

// How many previous dates we are willing to check.
const MAX_DAYS_BACK = 7;

type BerhanUsdRate = {
  buy: number;
  sell: number;
  date: string | null;
};

function parseRate(value: string | undefined): number | null {
  if (!value) return null;

  const parsed = Number.parseFloat(value.replace(/,/g, "").trim());

  return Number.isFinite(parsed) ? parsed : null;
}

function validPair(
  buy: number | null,
  sell: number | null
): buy is number {
  return (
    buy !== null &&
    sell !== null &&
    buy > 0 &&
    sell > 0 &&
    sell >= buy
  );
}

/**
 * Get YYYY-MM-DD using Ethiopia's timezone.
 */
function getAddisDate(daysBack = 0): string {
  const now = new Date();

  // Move backwards in absolute time.
  now.setUTCDate(now.getUTCDate() - daysBack);

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Addis_Ababa",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    throw new Error("Could not determine Ethiopia date.");
  }

  return `${year}-${month}-${day}`;
}

async function fetchPage(date?: string): Promise<string> {
  const url = date
    ? `${SOURCE_URL}?rate_date=${encodeURIComponent(date)}`
    : SOURCE_URL;

  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36"
    }
  });

  if (!response.ok) {
    throw new Error(
      `Berhan Bank page returned HTTP ${response.status}`
    );
  }

  return response.text();
}

/**
 * Berhan's page contains records similar to:
 *
 * <input
 *   type='hidden'
 *   id='USD'
 *   value={"buying":"161.7225","selling":"164.9570","currency":"USD",...}
 * />
 */
function extractUsd(html: string): {
  buy: number;
  sell: number;
} | null {
  const $ = cheerio.load(html);

  /*
   * First try the normal DOM representation.
   */
  const usdInput = $("input#USD").first();

  if (usdInput.length) {
    const rawValue = usdInput.attr("value");

    if (rawValue) {
      try {
        const parsed = JSON.parse(rawValue) as {
          buying?: string;
          selling?: string;
          currency?: string;
        };

        const buy = parseRate(parsed.buying);
        const sell = parseRate(parsed.selling);

        if (
          parsed.currency?.toUpperCase() === "USD" &&
          validPair(buy, sell)
        ) {
          return {
            buy,
            sell: sell!
          };
        }
      } catch {
        // Continue to raw HTML fallback.
      }
    }
  }

  /*
   * Raw HTML fallback.
   *
   * This handles Berhan's unusual unquoted JSON value:
   *
   * value={"buying":"161.7225",
   *        "selling":"164.9570",
   *        "currency":"USD"}
   */
  const patterns = [
    /value\s*=\s*\{[^}]*["']buying["']\s*:\s*["']([\d,.]+)["'][^}]*["']selling["']\s*:\s*["']([\d,.]+)["'][^}]*["']currency["']\s*:\s*["']USD["'][^}]*\}/i,

    /value\s*=\s*\{[^}]*["']currency["']\s*:\s*["']USD["'][^}]*["']buying["']\s*:\s*["']([\d,.]+)["'][^}]*["']selling["']\s*:\s*["']([\d,.]+)["'][^}]*\}/i
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);

    if (!match) {
      continue;
    }

    const buy = parseRate(match[1]);
    const sell = parseRate(match[2]);

    if (validPair(buy, sell)) {
      return {
        buy,
        sell: sell!
      };
    }
  }

  return null;
}

async function findLatestUsdRate(): Promise<BerhanUsdRate> {
  /*
   * First check Berhan's default/current page.
   */
  const currentHtml = await fetchPage();

  const currentUsd = extractUsd(currentHtml);

  if (currentUsd) {
    const currentDate = getAddisDate(0);

    console.log("[berhan] USD found on current page", {
      date: currentDate,
      buy: currentUsd.buy,
      sell: currentUsd.sell
    });

    return {
      ...currentUsd,
      date: currentDate
    };
  }

  console.log(
    "[berhan] current page has no USD; checking recent dates"
  );

  /*
   * Explicitly check today's Ethiopia date and then previous dates.
   *
   * This is important because Berhan can begin a new day's table
   * before USD has been populated.
   */
  for (let daysBack = 0; daysBack <= MAX_DAYS_BACK; daysBack++) {
    const date = getAddisDate(daysBack);

    const html = await fetchPage(date);

    const usd = extractUsd(html);

    if (!usd) {
      console.log(`[berhan] no USD for ${date}`);
      continue;
    }

    console.log("[berhan] USD found", {
      date,
      buy: usd.buy,
      sell: usd.sell
    });

    return {
      ...usd,
      date
    };
  }

  throw new Error(
    `Berhan Bank returned no USD exchange rate within the last ${MAX_DAYS_BACK + 1} dates.`
  );
}

export class BerhanProvider implements RateProvider {
  readonly name = "Berhan Bank";

  readonly slug = "berhan";

  readonly sourceUrl = SOURCE_URL;

  async fetchRates(): Promise<FxRate[]> {
    const usd = await findLatestUsdRate();

    const fetchedAt = new Date().toISOString();

    const effectiveAt = usd.date
      ? new Date(`${usd.date}T00:00:00+03:00`).toISOString()
      : fetchedAt;

    const rates: FxRate[] = [
      {
        bank: this.name,
        slug: this.slug,
        currency: "USD",
        buy: usd.buy,
        sell: usd.sell,
        rateType: "cash",
        sourceUrl: this.sourceUrl,
        effectiveAt,
        fetchedAt
      },
      {
        bank: this.name,
        slug: this.slug,
        currency: "USD",
        buy: usd.buy,
        sell: usd.sell,
        rateType: "transaction",
        sourceUrl: this.sourceUrl,
        effectiveAt,
        fetchedAt
      }
    ];

    console.log(
      "[berhan-output]",
      rates.map((rate) => ({
        rateType: rate.rateType,
        buy: rate.buy,
        sell: rate.sell,
        effectiveAt: rate.effectiveAt
      }))
    );

    return rates;
  }
}

export const berhanProvider = new BerhanProvider();