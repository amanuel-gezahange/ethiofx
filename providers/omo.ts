import * as cheerio from "cheerio";

import type { FxRate } from "@/lib/types";
import type { RateProvider } from "./provider";

const SOURCE_URL = "https://www.omobanksc.com/";

function parseRate(value: string | undefined): number | null {
  if (!value) return null;

  const parsed = Number.parseFloat(value.replace(/,/g, "").trim());

  return Number.isFinite(parsed) ? parsed : null;
}

function validPair(buy: number | null, sell: number | null): buy is number {
  return buy !== null && sell !== null && buy > 0 && sell > 0 && sell >= buy;
}

async function fetchPage(): Promise<string> {
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
    throw new Error(`Omo Bank returned HTTP ${response.status}`);
  }

  return response.text();
}

function extractUsdFromTable(
  $: cheerio.CheerioAPI,
  tableSelector: string
): {
  buy: number;
  sell: number;
} | null {
  let result: {
    buy: number;
    sell: number;
  } | null = null;

  $(`${tableSelector} tbody tr`).each((_, row) => {
    if (result) return;

    const cells = $(row).find("td");

    if (cells.length < 4) {
      return;
    }

    const values = cells
      .map((__, cell) => $(cell).text().replace(/\s+/g, " ").trim())
      .get();

    const currency = values[1]?.replace(/\s+/g, " ").trim().toUpperCase();

    if (!currency?.includes("USD") && !currency?.includes("US DOLLAR")) {
      return;
    }

    const buy = parseRate(values[2]);
    const sell = parseRate(values[3]);

    if (!validPair(buy, sell)) {
      return;
    }

    result = {
      buy,
      sell: sell!
    };
  });

  return result;
}

export class OmoProvider implements RateProvider {
  readonly name = "Omo Bank";
  readonly slug = "omo";
  readonly sourceUrl = SOURCE_URL;

  async fetchRates(): Promise<FxRate[]> {
    const html = await fetchPage();
    const $ = cheerio.load(html);

    const cash = extractUsdFromTable($, "#tablepress-2");

    const transaction = extractUsdFromTable($, "#tablepress-5");

    if (!cash || !transaction) {
      throw new Error(
        "Omo Bank page did not contain valid USD cash and transaction rows."
      );
    }

    const fetchedAt = new Date().toISOString();

    const rates: FxRate[] = [
      {
        bank: this.name,
        slug: this.slug,
        currency: "USD",
        buy: cash.buy,
        sell: cash.sell,
        rateType: "cash",
        sourceUrl: this.sourceUrl,
        effectiveAt: null,
        fetchedAt
      },
      {
        bank: this.name,
        slug: this.slug,
        currency: "USD",
        buy: transaction.buy,
        sell: transaction.sell,
        rateType: "transaction",
        sourceUrl: this.sourceUrl,
        effectiveAt: null,
        fetchedAt
      }
    ];

    console.log(
      "[omo-output]",
      rates.map((rate) => ({
        rateType: rate.rateType,
        buy: rate.buy,
        sell: rate.sell
      }))
    );

    return rates;
  }
}

export const omoProvider = new OmoProvider();
