import * as cheerio from "cheerio";

import type { FxRate } from "@/lib/types";
import type { RateProvider } from "./provider";

const SOURCE_URL = "https://www.globalbankethiopia.com/";

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
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36"
    }
  });

  if (!response.ok) {
    throw new Error(
      `Global Bank Ethiopia returned HTTP ${response.status}`
    );
  }

  return response.text();
}

function extractUsdRate(
  $: cheerio.CheerioAPI
): {
  buy: number;
  sell: number;
} | null {
  let result: {
    buy: number;
    sell: number;
  } | null = null;

  $("tr").each((_, row) => {
    if (result) return;

    const cells = $(row).find("td");

    if (cells.length < 3) {
      return;
    }

    const currency = $(cells[0])
      .text()
      .replace(/\s+/g, " ")
      .trim()
      .toUpperCase();

    if (currency !== "USD") {
      return;
    }

    const buy = parseRate(
      $(cells[1]).text()
    );

    const sell = parseRate(
      $(cells[2]).text()
    );

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

export class GlobalProvider
  implements RateProvider
{
  readonly name =
    "Global Bank Ethiopia";

  readonly slug =
    "global";

  readonly sourceUrl =
    SOURCE_URL;

  async fetchRates(): Promise<FxRate[]> {
    const html = await fetchPage();

    const $ = cheerio.load(html);

    const usd = extractUsdRate($);

    if (!usd) {
      throw new Error(
        "Global Bank Ethiopia page did not contain a valid USD exchange-rate row."
      );
    }

    const fetchedAt =
      new Date().toISOString();

    const rates: FxRate[] = [
      {
        bank: this.name,
        slug: this.slug,
        currency: "USD",
        buy: usd.buy,
        sell: usd.sell,
        rateType: "cash",
        sourceUrl: this.sourceUrl,
        effectiveAt: fetchedAt,
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
        effectiveAt: fetchedAt,
        fetchedAt
      }
    ];

    console.log(
      "[global-output]",
      rates.map((rate) => ({
        rateType: rate.rateType,
        buy: rate.buy,
        sell: rate.sell
      }))
    );

    return rates;
  }
}

export const globalProvider =
  new GlobalProvider();