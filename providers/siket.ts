import * as cheerio from "cheerio";

import type { FxRate } from "@/lib/types";
import type { RateProvider } from "./provider";

const SOURCE_URL = "https://siketbank.com/exchange-rate";

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

  const match = value.match(/^([A-Za-z]{3})\s+(\d{1,2}),\s+(\d{4})$/);

  if (!match) return null;

  const months: Record<string, number> = {
    jan: 0,
    feb: 1,
    mar: 2,
    apr: 3,
    may: 4,
    jun: 5,
    jul: 6,
    aug: 7,
    sep: 8,
    oct: 9,
    nov: 10,
    dec: 11
  };

  const month = months[match[1].toLowerCase()];
  const day = Number(match[2]);
  const year = Number(match[3]);

  if (month === undefined) return null;

  const mm = String(month + 1).padStart(2, "0");
  const dd = String(day).padStart(2, "0");

  const parsed = new Date(`${year}-${mm}-${dd}T00:00:00+03:00`);

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
    throw new Error(`Siket Bank returned HTTP ${response.status}`);
  }

  return response.text();
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

  $("tr").each((_, row) => {
    if (result) return;

    const rowText = $(row).text().replace(/\s+/g, " ").trim().toUpperCase();

    if (!rowText.includes("US") && !rowText.includes("DOLLAR")) {
      return;
    }

    const cells = $(row).find("td");

    if (cells.length < 4) {
      return;
    }

    const values = cells
      .map((__, cell) => $(cell).text().replace(/\s+/g, " ").trim())
      .get();

    const cashBuy = parseRate(values[0]);
    const cashSell = parseRate(values[1]);
    const transactionBuy = parseRate(values[2]);
    const transactionSell = parseRate(values[3]);

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

function extractEffectiveDate(html: string): string | null {
  const clean = cheerio.load(html).root().text().replace(/\s+/g, " ").trim();

  const match = clean.match(/\b([A-Z][a-z]{2}\s+\d{1,2},\s+\d{4})\b/);

  return match?.[1] ?? null;
}

export class SiketProvider implements RateProvider {
  readonly name = "Siket Bank";
  readonly slug = "siket";
  readonly sourceUrl = SOURCE_URL;

  async fetchRates(): Promise<FxRate[]> {
    const html = await fetchPage();
    const $ = cheerio.load(html);

    const usd = extractUsdRate($);

    if (!usd) {
      throw new Error(
        "Siket Bank page did not contain a valid USD exchange-rate row."
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

    console.log("[siket-output]", {
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

export const siketProvider = new SiketProvider();
