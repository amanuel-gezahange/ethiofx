import * as cheerio from "cheerio";

import type { FxRate } from "@/lib/types";
import type { RateProvider } from "./provider";

const SOURCE_URL = "https://sidamabanksc.com/exchange-rate/";

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
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36"
    }
  });

  if (!response.ok) {
    throw new Error(`Sidama Bank returned HTTP ${response.status}`);
  }

  return response.text();
}

function extractEffectiveDate(html: string): string | null {
  const match = html.match(/Daily Rates[\s\S]*?([A-Z][a-z]+ \d{1,2}, \d{4})/i);

  return match?.[1] ?? null;
}

function extractUsdRate($: cheerio.CheerioAPI): {
  cashBuy: number;
  cashSell: number;
  transactionBuy: number;
  transactionSell: number;
} | null {
  let result: {
    cashBuy: number;
    cashSell: number;
    transactionBuy: number;
    transactionSell: number;
  } | null = null;

  $(".ser-card").each((_, card) => {
    if (result) return;

    const text = $(card).text().replace(/\s+/g, " ").trim();

    if (!/\bUSD\b/i.test(text) && !/United States Dollar/i.test(text)) {
      return;
    }

    const cashBuyMatch = text.match(/Cash Buying\s*([\d.]+)/i);

    const cashSellMatch = text.match(/Cash Selling\s*([\d.]+)/i);

    const transactionBuyMatch = text.match(/Transactional Buying\s*([\d.]+)/i);

    const transactionSellMatch = text.match(
      /Transactional Selling\s*([\d.]+)/i
    );

    const cashBuy = parseRate(cashBuyMatch?.[1]);

    const cashSell = parseRate(cashSellMatch?.[1]);

    const transactionBuy = parseRate(transactionBuyMatch?.[1]);

    const transactionSell = parseRate(transactionSellMatch?.[1]);

    if (
      !validPair(cashBuy, cashSell) ||
      !validPair(transactionBuy, transactionSell)
    ) {
      return;
    }

    result = {
      cashBuy,
      cashSell: cashSell!,
      transactionBuy,
      transactionSell: transactionSell!
    };
  });

  return result;
}

export class SidamaProvider implements RateProvider {
  readonly name = "Sidama Bank";
  readonly slug = "sidama";
  readonly sourceUrl = SOURCE_URL;

  async fetchRates(): Promise<FxRate[]> {
    const html = await fetchPage();
    const $ = cheerio.load(html);

    const usd = extractUsdRate($);

    if (!usd) {
      throw new Error(
        "Sidama Bank page did not contain a valid USD exchange-rate card."
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
        buy: usd.cashBuy,
        sell: usd.cashSell,
        rateType: "cash",
        sourceUrl: this.sourceUrl,
        effectiveAt,
        fetchedAt
      },
      {
        bank: this.name,
        slug: this.slug,
        currency: "USD",
        buy: usd.transactionBuy,
        sell: usd.transactionSell,
        rateType: "transaction",
        sourceUrl: this.sourceUrl,
        effectiveAt,
        fetchedAt
      }
    ];

    console.log("[sidama-output]", {
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

export const sidamaProvider = new SidamaProvider();
