import * as cheerio from "cheerio";

import type { FxRate } from "@/lib/types";
import type { RateProvider } from "./provider";

const SOURCE_URL = "https://berhanbanksc.com/";

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
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
      Referer: "https://www.google.com/"
    }
  });

  if (!response.ok) {
    throw new Error(`Berhan Bank page returned HTTP ${response.status}`);
  }

  return response.text();
}

function extractEffectiveDate($: cheerio.CheerioAPI): string | null {
  let result: string | null = null;

  $(".containerCard .header").each((_, element) => {
    if (result) return;

    const text = $(element).text().replace(/\s+/g, " ").trim();

    const parsed = new Date(text);

    if (!Number.isNaN(parsed.getTime())) {
      const year = parsed.getFullYear();
      const month = String(parsed.getMonth() + 1).padStart(2, "0");
      const day = String(parsed.getDate()).padStart(2, "0");

      result = `${year}-${month}-${day}`;
    }
  });

  return result;
}

export class BerhanProvider implements RateProvider {
  readonly name = "Berhan Bank";
  readonly slug = "berhan";
  readonly sourceUrl = SOURCE_URL;

  async fetchRates(): Promise<FxRate[]> {
    const html = await fetchPage();
    const $ = cheerio.load(html);

    const usdInput = $("input#USD").first();

    if (!usdInput.length) {
      throw new Error(
        "Berhan Bank page did not contain the USD exchange-rate record."
      );
    }

    const rawValue = usdInput.attr("value");

    if (!rawValue) {
      throw new Error("Berhan Bank USD exchange-rate record had no value.");
    }

    let parsedData: {
      buying?: string;
      selling?: string;
      currency?: string;
    };

    try {
      parsedData = JSON.parse(rawValue);
    } catch {
      throw new Error("Berhan Bank USD exchange-rate data was not valid JSON.");
    }

    const buy = parseRate(parsedData.buying);
    const sell = parseRate(parsedData.selling);

    if (!validPair(buy, sell)) {
      throw new Error("Berhan Bank returned no valid USD exchange rate.");
    }

    const fetchedAt = new Date().toISOString();

    const date = extractEffectiveDate($);

    const effectiveAt = date
      ? new Date(`${date}T00:00:00+03:00`).toISOString()
      : fetchedAt;

    return [
      {
        bank: this.name,
        slug: this.slug,
        currency: "USD",
        buy,
        sell: sell!,
        rateType: "cash",
        sourceUrl: this.sourceUrl,
        effectiveAt: fetchedAt,
        fetchedAt
      },
      {
        bank: this.name,
        slug: this.slug,
        currency: "USD",
        buy,
        sell: sell!,
        rateType: "transaction",
        sourceUrl: this.sourceUrl,
        effectiveAt: fetchedAt,
        fetchedAt
      }
    ];
  }
}

export const berhanProvider = new BerhanProvider();
