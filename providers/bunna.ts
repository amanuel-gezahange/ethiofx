import * as cheerio from "cheerio";

import type { FxRate } from "@/lib/types";
import type { RateProvider } from "./provider";

const SOURCE_URL = "https://bunnabanksc.com/foreign-exchange/";

function parseRate(value: string | undefined): number | null {
  if (!value) return null;

  const cleaned = value.replace(/,/g, "").trim();
  const parsed = Number.parseFloat(cleaned);

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

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function extractUsdRates(html: string): {
  cashBuy: number | null;
  cashSell: number | null;
  transactionBuy: number | null;
  transactionSell: number | null;
} {
  const $ = cheerio.load(html);

  let cashBuy: number | null = null;
  let cashSell: number | null = null;
  let transactionBuy: number | null = null;
  let transactionSell: number | null = null;

  $("tr").each((_, row) => {
    const cells = $(row)
      .find("th, td")
      .map((_, cell) => normalizeText($(cell).text()))
      .get();

    if (cells.length < 6) return;

    const rowText = cells.join(" ").toUpperCase();

    if (!rowText.includes("USD")) return;

    /*
      Expected Bunna row:
      US Dollar | USD |
      cash buy | cash sell |
      transaction buy | transaction sell |
      average buy | average sell
    */

    const usdIndex = cells.findIndex(
      (cell) => cell.toUpperCase() === "USD"
    );

    if (usdIndex === -1) return;

    cashBuy = parseRate(cells[usdIndex + 1]);
    cashSell = parseRate(cells[usdIndex + 2]);

    transactionBuy = parseRate(cells[usdIndex + 3]);
    transactionSell = parseRate(cells[usdIndex + 4]);
  });

  return {
    cashBuy,
    cashSell,
    transactionBuy,
    transactionSell
  };
}

async function fetchWithRetry(
  url: string,
  attempts = 3
): Promise<Response> {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(url, {
        cache: "no-store",
        headers: {
          Accept: "text/html,application/xhtml+xml",
          "User-Agent":
            "Mozilla/5.0 (compatible; EthioFX/1.0; exchange-rate-monitor)"
        }
      });

      if (response.ok) {
        return response;
      }

      if (response.status >= 400 && response.status < 500) {
        throw new Error(
          `Bunna Bank returned HTTP ${response.status}`
        );
      }

      lastError = new Error(
        `Bunna Bank returned HTTP ${response.status}`
      );
    } catch (error) {
      lastError = error;

      if (attempt === attempts) {
        throw error;
      }
    }

    if (attempt < attempts) {
      await new Promise((resolve) =>
        setTimeout(resolve, attempt * 1000)
      );
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Bunna Bank request failed.");
}

export class BunnaProvider implements RateProvider {
  readonly name = "Bunna Bank";
  readonly slug = "bunna";
  readonly sourceUrl = SOURCE_URL;

  async fetchRates(): Promise<FxRate[]> {
    const response = await fetchWithRetry(this.sourceUrl);
    const html = await response.text();

    const {
      cashBuy,
      cashSell,
      transactionBuy,
      transactionSell
    } = extractUsdRates(html);

    const fetchedAt = new Date().toISOString();

    // Bunna's visible page does not currently expose a clear
    // machine-readable effective date, so use fetch time.
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
        "Bunna Bank returned no valid USD rates."
      );
    }

    return output;
  }
}

export const bunnaProvider = new BunnaProvider();