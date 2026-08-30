import * as cheerio from "cheerio";

import type { FxRate } from "@/lib/types";
import type { RateProvider } from "./provider";

const SOURCE_URL = "https://tsehaybank.com.et/exchange-rate/";

function parseRate(value: string | undefined): number | null {
  if (!value) return null;

  const parsed = Number.parseFloat(
    value.replace(/,/g, "").replace(/\s+/g, " ").trim()
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

function normalize(value: string): string {
  return value.replace(/\s+/g, " ").trim();
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
      `Tsehay Bank page returned HTTP ${response.status}`
    );
  }

  return response.text();
}

export class TsehayProvider implements RateProvider {
  readonly name = "Tsehay Bank";
  readonly slug = "tsehay";
  readonly sourceUrl = SOURCE_URL;

  async fetchRates(): Promise<FxRate[]> {
    const html = await fetchPage();
    const $ = cheerio.load(html);

    let cashBuy: number | null = null;
    let cashSell: number | null = null;
    let transactionBuy: number | null = null;
    let transactionSell: number | null = null;

    $("tr").each((_, row) => {
      const cells = $(row)
        .find("td")
        .map((_, cell) => normalize($(cell).text()))
        .get();

      if (cells.length < 5) return;

      const currency = cells[0].toUpperCase();

      if (!currency.includes("USD")) return;

      cashBuy = parseRate(cells[1]);
      cashSell = parseRate(cells[2]);
      transactionBuy = parseRate(cells[3]);
      transactionSell = parseRate(cells[4]);
    });

    const fetchedAt = new Date().toISOString();
    const effectiveAt = null;

    const output: FxRate[] = [];

    if (validPair(cashBuy, cashSell)) {
      output.push({
        bank: this.name,
        slug: this.slug,
        currency: "USD",
        buy: cashBuy,
        sell: cashSell!,
        rateType: "cash",
        sourceUrl: this.sourceUrl,
        effectiveAt,
        fetchedAt
      });
    }

    if (validPair(transactionBuy, transactionSell)) {
      output.push({
        bank: this.name,
        slug: this.slug,
        currency: "USD",
        buy: transactionBuy,
        sell: transactionSell!,
        rateType: "transaction",
        sourceUrl: this.sourceUrl,
        effectiveAt,
        fetchedAt
      });
    }

    if (output.length === 0) {
      throw new Error(
        "Tsehay Bank returned no valid USD exchange rates."
      );
    }

    return output;
  }
}

export const tsehayProvider = new TsehayProvider();