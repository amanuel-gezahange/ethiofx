import * as cheerio from "cheerio";
import { Agent } from "undici";

import type { FxRate } from "@/lib/types";
import type { RateProvider } from "./provider";

const SOURCE_URL =
  "https://www.amharabank.com/daily-exchange-rate/";

const insecureDispatcher = new Agent({
  connect: {
    rejectUnauthorized: false
  }
});

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
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(SOURCE_URL, {
        cache: "no-store",
        headers: {
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36"
        },
        dispatcher: insecureDispatcher
      } as RequestInit & { dispatcher: Agent });

      if (!response.ok) {
        throw new Error(
          `Amhara Bank page returned HTTP ${response.status}`
        );
      }

      return await response.text();
    } catch (error) {
      console.warn(
        `[amhara] Fetch attempt ${attempt}/${maxAttempts} failed`,
        error
      );

      if (attempt === maxAttempts) {
        throw error;
      }

      await new Promise((resolve) =>
        setTimeout(resolve, attempt * 1000)
      );
    }
  }

  throw new Error("Amhara Bank fetch failed.");
}

export class AmharaProvider implements RateProvider {
  readonly name = "Amhara Bank";
  readonly slug = "amhara";
  readonly sourceUrl = SOURCE_URL;

  async fetchRates(): Promise<FxRate[]> {
    const html = await fetchPage();
    const $ = cheerio.load(html);

    let cashBuy: number | null = null;
    let cashSell: number | null = null;
    let transactionBuy: number | null = null;
    let transactionSell: number | null = null;

    $("tr.wpr-table-body-row").each((_, row) => {
      const cells = $(row)
        .find("td")
        .map((_, cell) => normalize($(cell).text()))
        .get();

      if (cells.length < 6) {
        return;
      }

      const currency = cells[1]?.toUpperCase() ?? "";

      if (!currency.includes("USD")) {
        return;
      }

      /*
        Expected Amhara USD row:

        [0] icon
        [1] US Dollar (USD)
        [2] cash buying
        [3] cash selling
        [4] transaction buying
        [5] transaction selling
      */

      cashBuy = parseRate(cells[2]);
      cashSell = parseRate(cells[3]);

      transactionBuy = parseRate(cells[4]);
      transactionSell = parseRate(cells[5]);
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
        "Amhara Bank returned no valid USD exchange rates."
      );
    }

    return output;
  }
}

export const amharaProvider = new AmharaProvider();