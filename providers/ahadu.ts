import * as cheerio from "cheerio";

import type { FxRate } from "@/lib/types";
import type { RateProvider } from "./provider";

const SOURCE_URL = "https://ahadubank.com/";

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
    throw new Error(`Ahadu Bank returned HTTP ${response.status}`);
  }

  return response.text();
}

function parseDate(year: number, month: number, day: number): string | null {
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");

  const parsed = new Date(`${year}-${mm}-${dd}T00:00:00+03:00`);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}

function monthNumber(value: string): number | null {
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

  return months[value.toLowerCase()] ?? null;
}

function extractMainDate(text: string): string | null {
  const match = text.match(
    /Exchange\s+Rates\s+([A-Za-z]+)\s+(\d{1,2})\s*,\s*(\d{4})/i
  );

  if (!match) return null;

  const month = monthNumber(match[1]);
  const day = Number(match[2]);
  const year = Number(match[3]);

  if (month === null) return null;

  return parseDate(year, month, day);
}

function extractWeightedDate(text: string): string | null {
  const match = text.match(
    /WEIGHTED\s+AVERAGE\s+RATE\s+FOR\s*:\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/i
  );

  if (!match) return null;

  return parseDate(Number(match[3]), Number(match[2]), Number(match[1]));
}

function extractMainUsd($: cheerio.CheerioAPI): {
  buy: number;
  sell: number;
} | null {
  let result: {
    buy: number;
    sell: number;
  } | null = null;

  $(".litho-image-box-wrapper").each((_, item) => {
    if (result) return;

    const block = $(item).text().replace(/\s+/g, " ").trim();

    if (!/US\s*-\s*DOLLAR/i.test(block)) {
      return;
    }

    const buyMatch = block.match(/Buying\s*:\s*([0-9,.]+)/i);

    const sellMatch = block.match(/Selling\s*:\s*([0-9,.]+)/i);

    const buy = parseRate(buyMatch?.[1]);
    const sell = parseRate(sellMatch?.[1]);

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

function extractWeightedUsd($: cheerio.CheerioAPI): {
  buy: number;
  sell: number;
} | null {
  let result: {
    buy: number;
    sell: number;
  } | null = null;

  $(".litho-image-box-wrapper").each((_, item) => {
    if (result) return;

    const block = $(item).text().replace(/\s+/g, " ").trim();

    if (!/CURR\s*:\s*USD/i.test(block)) {
      return;
    }

    const buyMatch = block.match(/Buying\s+Rate\s*:\s*([0-9,.]+)/i);

    const sellMatch = block.match(/Selling\s+Rate\s*:\s*([0-9,.]+)/i);

    const buy = parseRate(buyMatch?.[1]);
    const sell = parseRate(sellMatch?.[1]);

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

export class AhaduProvider implements RateProvider {
  readonly name = "Ahadu Bank";
  readonly slug = "ahadu";
  readonly sourceUrl = SOURCE_URL;

  async fetchRates(): Promise<FxRate[]> {
    const html = await fetchPage();
    const $ = cheerio.load(html);

    const pageText = $.root().text().replace(/\s+/g, " ").trim();

    const cash = extractMainUsd($);
    const transaction = extractWeightedUsd($);

    if (!cash) {
      throw new Error(
        "Ahadu Bank page did not contain a valid USD exchange-rate block."
      );
    }

    if (!transaction) {
      throw new Error(
        "Ahadu Bank page did not contain a valid USD weighted-average block."
      );
    }

    const fetchedAt = new Date().toISOString();

    const mainEffectiveAt = extractMainDate(pageText) ?? fetchedAt;

    const weightedEffectiveAt =
      extractWeightedDate(pageText) ?? mainEffectiveAt;

    const rates: FxRate[] = [
      {
        bank: this.name,
        slug: this.slug,
        currency: "USD",
        buy: cash.buy,
        sell: cash.sell,
        rateType: "cash",
        sourceUrl: this.sourceUrl,
        effectiveAt: mainEffectiveAt,
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
        effectiveAt: weightedEffectiveAt,
        fetchedAt
      }
    ];

    console.log("[ahadu-output]", {
      mainEffectiveAt,
      weightedEffectiveAt,
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

export const ahaduProvider = new AhaduProvider();
