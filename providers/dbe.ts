import * as cheerio from "cheerio";

import type { FxRate } from "@/lib/types";
import type { RateProvider } from "./provider";

const SOURCE_URL = "https://dbe.com.et/";

function parseRate(value: string | undefined): number | null {
  if (!value) return null;

  const parsed = Number.parseFloat(value.replace(/,/g, "").trim());

  return Number.isFinite(parsed) ? parsed : null;
}

function validPair(buy: number | null, sell: number | null): buy is number {
  return buy !== null && sell !== null && buy > 0 && sell > 0 && sell >= buy;
}

function parseEffectiveDate(value: string | null): string | null {
  if (!value) return null;

  const parsed = new Date(`${value} 00:00:00 GMT+0300`);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
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
    throw new Error(
      `Development Bank of Ethiopia returned HTTP ${response.status}`
    );
  }

  return response.text();
}

function extractUsdRate($: cheerio.CheerioAPI): {
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

    if (cells.length < 4) {
      return;
    }

    const values = cells
      .map((__, cell) => $(cell).text().replace(/\s+/g, " ").trim())
      .get();

    const code = values[1]?.trim().toUpperCase();

    if (code !== "USD") {
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

function extractEffectiveDate(html: string): string | null {
  const $ = cheerio.load(html);

  const text = $.root().text().replace(/\s+/g, " ").trim();

  const match = text.match(
    /Prevailing Exchange Rate\s+([A-Z][a-z]+ \d{1,2}, \d{4})/i
  );

  return match?.[1] ?? null;
}

export class DbeProvider implements RateProvider {
  readonly name = "Development Bank of Ethiopia";

  readonly slug = "dbe";
  readonly sourceUrl = SOURCE_URL;

  async fetchRates(): Promise<FxRate[]> {
    const html = await fetchPage();
    const $ = cheerio.load(html);

    const usd = extractUsdRate($);

    if (!usd) {
      throw new Error(
        "Development Bank of Ethiopia page did not contain a valid USD exchange-rate row."
      );
    }

    const fetchedAt = new Date().toISOString();

    const sourceDate = extractEffectiveDate(html);

    const effectiveAt = parseEffectiveDate(sourceDate) ?? fetchedAt;

    const rates: FxRate[] = [
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

    console.log("[dbe-output]", {
      sourceDate,
      rates: rates.map((rate) => ({
        rateType: rate.rateType,
        buy: rate.buy,
        sell: rate.sell,
        effectiveAt: rate.effectiveAt
      }))
    });

    return rates;
  }
}

export const dbeProvider = new DbeProvider();
