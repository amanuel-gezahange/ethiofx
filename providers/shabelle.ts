import * as cheerio from "cheerio";

import type { FxRate } from "@/lib/types";
import type { RateProvider } from "./provider";

const SOURCE_URL = "https://shabellebank.net/";

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

  const match = value.match(/^(\d{1,2})-([A-Za-z]+)-(\d{4})$/);

  if (!match) return null;

  const day = Number(match[1]);
  const monthName = match[2].toLowerCase();
  const year = Number(match[3]);

  const months: Record<string, number> = {
    january: 0,
    february: 1,
    march: 2,
    april: 3,
    may: 4,
    june: 5,
    july: 6,
    august: 7,
    september: 8,
    october: 9,
    november: 10,
    december: 11
  };

  const month = months[monthName];

  if (month === undefined) {
    return null;
  }

  const date = new Date(Date.UTC(year, month, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  const mm = String(month + 1).padStart(2, "0");
  const dd = String(day).padStart(2, "0");

  return new Date(`${year}-${mm}-${dd}T00:00:00+03:00`).toISOString();
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
    throw new Error(`Shabelle Bank returned HTTP ${response.status}`);
  }

  return response.text();
}

function extractRatesFromText(text: string): {
  cashBuy: number;
  cashSell: number;
  transactionBuy: number;
  transactionSell: number;
} | null {
  const cashMatch = text.match(
    /usd\s+American Dollar\s+Cash Buying\s+CashSelling\s+([\d.]+)\s+([\d.]+)/i
  );

  const transactionMatch = text.match(
    /USD\s+American Dollar\s+Trans Buying\s+Trans Selling\s+([\d.]+)\s+([\d.]+)/i
  );

  const cashBuy = parseRate(cashMatch?.[1]);

  const cashSell = parseRate(cashMatch?.[2]);

  const transactionBuy = parseRate(transactionMatch?.[1]);

  const transactionSell = parseRate(transactionMatch?.[2]);

  if (
    !validPair(cashBuy, cashSell) ||
    !validPair(transactionBuy, transactionSell)
  ) {
    return null;
  }

  return {
    cashBuy,
    cashSell: cashSell!,
    transactionBuy,
    transactionSell: transactionSell!
  };
}

function extractEffectiveDate(text: string): string | null {
  const match = text.match(
    /Applicable\s+on\s+(\d{1,2}\s*-\s*[A-Za-z]+\s*-\s*\d{4})/i
  );

  return match?.[1]?.replace(/\s+/g, "") ?? null;
}

export class ShabelleProvider implements RateProvider {
  readonly name = "Shabelle Bank";
  readonly slug = "shabelle";
  readonly sourceUrl = SOURCE_URL;

  async fetchRates(): Promise<FxRate[]> {
    const html = await fetchPage();

    const $ = cheerio.load(html);

    const text = $.root().text().replace(/\s+/g, " ").trim();

    const usd = extractRatesFromText(text);

    if (!usd) {
      throw new Error(
        "Shabelle Bank page did not contain valid USD cash and transaction rates."
      );
    }

    const sourceDate = extractEffectiveDate(text);

    const fetchedAt = new Date().toISOString();

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

    console.log("[shabelle-output]", {
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

export const shabelleProvider = new ShabelleProvider();
