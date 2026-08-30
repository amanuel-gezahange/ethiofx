import * as cheerio from "cheerio";

import type { FxRate } from "@/lib/types";
import type { RateProvider } from "./provider";

const SOURCE_URL = "https://www.tsedeybank.com.et/";

type TsedeyRecord = {
  category: string;
  buy: number;
  sell: number;
  updatedAt: string | null;
};

function parseRate(value: string | undefined): number | null {
  if (!value) return null;

  const parsed = Number.parseFloat(
    value.replace(/,/g, "").trim()
  );

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

async function fetchPage(): Promise<string> {
  const response = await fetch(SOURCE_URL, {
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
      `Tsedey Bank returned HTTP ${response.status}`
    );
  }

  return response.text();
}

function extractUsdRecords(html: string): TsedeyRecord[] {
  const matches = html.matchAll(
    /\{"id":\d+,"name":"US DOLLAR","code":"USD","category":"([^"]+)","buying_rate":"([^"]+)","selling_rate":"([^"]+)"[^}]*"updated_at":"([^"]+)"/g
  );

  const results: TsedeyRecord[] = [];

  for (const match of matches) {
    const category = match[1];
    const buy = parseRate(match[2]);
    const sell = parseRate(match[3]);
    const updatedAt = match[4] || null;

    if (!validPair(buy, sell)) {
      continue;
    }

    results.push({
      category,
      buy,
      sell: sell!,
      updatedAt
    });
  }

  return results;
}

function firstByCategory(
  records: TsedeyRecord[],
  category: string
): TsedeyRecord | null {
  return (
    records.find(
      (record) =>
        record.category.toLowerCase() ===
        category.toLowerCase()
    ) ?? null
  );
}

export class TsedeyProvider implements RateProvider {
  readonly name = "Tsedey Bank";
  readonly slug = "tsedey";
  readonly sourceUrl = SOURCE_URL;

  async fetchRates(): Promise<FxRate[]> {
    const html = await fetchPage();

    // Keep this load so malformed HTML is normalized if we
    // later need DOM-based fallbacks.
    cheerio.load(html);

    const records = extractUsdRecords(html);

    const cash = firstByCategory(
      records,
      "cash"
    );

    const nonCash = firstByCategory(
      records,
      "non-cash"
    );

    if (!cash || !nonCash) {
      throw new Error(
        "Tsedey Bank page did not contain valid USD cash and non-cash exchange-rate records."
      );
    }

    const fetchedAt =
      new Date().toISOString();

    const cashEffectiveAt =
      cash.updatedAt &&
      !Number.isNaN(
        new Date(cash.updatedAt).getTime()
      )
        ? new Date(
            cash.updatedAt
          ).toISOString()
        : fetchedAt;

    const transactionEffectiveAt =
      nonCash.updatedAt &&
      !Number.isNaN(
        new Date(
          nonCash.updatedAt
        ).getTime()
      )
        ? new Date(
            nonCash.updatedAt
          ).toISOString()
        : fetchedAt;

    const rates: FxRate[] = [
      {
        bank: this.name,
        slug: this.slug,
        currency: "USD",
        buy: cash.buy,
        sell: cash.sell,
        rateType: "cash",
        sourceUrl: this.sourceUrl,
        effectiveAt: cashEffectiveAt,
        fetchedAt
      },
      {
        bank: this.name,
        slug: this.slug,
        currency: "USD",
        buy: nonCash.buy,
        sell: nonCash.sell,
        rateType: "transaction",
        sourceUrl: this.sourceUrl,
        effectiveAt:
          transactionEffectiveAt,
        fetchedAt
      }
    ];

    console.log(
      "[tsedey-output]",
      rates.map((rate) => ({
        rateType: rate.rateType,
        buy: rate.buy,
        sell: rate.sell,
        effectiveAt:
          rate.effectiveAt
      }))
    );

    return rates;
  }
}

export const tsedeyProvider =
  new TsedeyProvider();