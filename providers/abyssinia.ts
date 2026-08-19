import { Agent } from "undici";
import https from "node:https";
import type { FxRate } from "@/lib/types";
import type { RateProvider } from "./provider";

const SOURCE_URL = "https://www.bankofabyssinia.com/exchange-rate-2/";

function parseRate(value: string | undefined): number | null {
  if (!value) return null;

  const rate = Number(value.trim());

  return Number.isFinite(rate) && rate > 0 ? rate : null;
}

function validPair(buy: number | null, sell: number | null): buy is number {
  return buy !== null && sell !== null && sell > buy;
}

function extractUsdRates(html: string) {
  const cashMarker = html.indexOf("Cash Rates");
  const transactionMarker = html.indexOf("Transaction Rates");

  if (cashMarker === -1 || transactionMarker === -1) {
    throw new Error(
      "Bank of Abyssinia page did not contain expected rate sections."
    );
  }

  function extractUsdAfter(startIndex: number) {
    const usdIndex = html.indexOf(">USD</td>", startIndex);

    if (usdIndex === -1) {
      throw new Error("Bank of Abyssinia section did not contain a USD row.");
    }

    const rowStart = html.lastIndexOf("<tr", usdIndex);
    const rowEnd = html.indexOf("</tr>", usdIndex);

    if (rowStart === -1 || rowEnd === -1) {
      throw new Error("Bank of Abyssinia USD row could not be parsed.");
    }

    const row = html.slice(rowStart, rowEnd + 5);

    const buyMatch = row.match(
      /class=["']column-2["'][^>]*>\s*([0-9.]+)\s*<\/td>/i
    );

    const sellMatch = row.match(
      /class=["']column-3["'][^>]*>\s*([0-9.]+)\s*<\/td>/i
    );

    return {
      buy: parseRate(buyMatch?.[1]),
      sell: parseRate(sellMatch?.[1])
    };
  }

  const cash = extractUsdAfter(cashMarker);
  const transaction = extractUsdAfter(transactionMarker);

  return {
    cashBuy: cash.buy,
    cashSell: cash.sell,
    transactionBuy: transaction.buy,
    transactionSell: transaction.sell
  };
}

function extractEffectiveDate(html: string): string | null {
  const monthNames: Record<string, string> = {
    January: "01",
    February: "02",
    March: "03",
    April: "04",
    May: "05",
    June: "06",
    July: "07",
    August: "08",
    September: "09",
    October: "10",
    November: "11",
    December: "12"
  };

  const match = html.match(
    /(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(\d{4})/
  );

  if (!match) return null;

  const [, monthName, day, year] = match;
  const month = monthNames[monthName];

  return `${year}-${month}-${day.padStart(2, "0")}`;
}

async function fetchWithRetry(url: string, attempts = 3): Promise<Response> {
  let lastStatus: number | null = null;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          Accept: "text/html",
          "User-Agent":
            "Mozilla/5.0 (compatible; EthioFX/1.0; exchange-rate-monitor)"
        },
        cache: "no-store"
      });

      if (response.ok) {
        return response;
      }

      lastStatus = response.status;

      if (response.status >= 400 && response.status < 500) {
        throw new Error(`Bank of Abyssinia returned HTTP ${response.status}`);
      }
    } catch (error) {
      if (attempt === attempts) {
        throw error;
      }
    }

    if (attempt < attempts) {
      await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
    }
  }

  throw new Error(
    `Bank of Abyssinia returned HTTP ${lastStatus ?? "unknown"} after ${attempts} attempts`
  );
}

export class AbyssiniaProvider implements RateProvider {
  readonly name = "Bank of Abyssinia";
  readonly slug = "abyssinia";
  private readonly insecureDispatcher = new Agent({
    connect: {
      rejectUnauthorized: false
    }
  });
  readonly sourceUrl = SOURCE_URL;

  async fetchRates(): Promise<FxRate[]> {
    const response = await fetch(this.sourceUrl, {
      headers: {
        Accept: "text/html",
        "User-Agent":
          "Mozilla/5.0 (compatible; EthioFX/1.0; exchange-rate-monitor)"
      },
      cache: "no-store",
      dispatcher: this.insecureDispatcher
    } as RequestInit & { dispatcher: Agent });
    const html = await response.text();

    const usd = extractUsdRates(html);
    const date = extractEffectiveDate(html);

    if (!date) {
      throw new Error(
        "Bank of Abyssinia page did not contain an effective date."
      );
    }

    const effectiveAt = new Date(`${date}T00:00:00+03:00`).toISOString();

    const fetchedAt = new Date().toISOString();

    const output: FxRate[] = [];

    if (validPair(usd.cashBuy, usd.cashSell)) {
      output.push({
        bank: this.name,
        slug: this.slug,
        currency: "USD",
        buy: usd.cashBuy,
        sell: usd.cashSell!,
        rateType: "cash",
        sourceUrl: SOURCE_URL,
        effectiveAt,
        fetchedAt
      });
    }

    if (validPair(usd.transactionBuy, usd.transactionSell)) {
      output.push({
        bank: this.name,
        slug: this.slug,
        currency: "USD",
        buy: usd.transactionBuy,
        sell: usd.transactionSell!,
        rateType: "transaction",
        sourceUrl: SOURCE_URL,
        effectiveAt,
        fetchedAt
      });
    }

    if (output.length === 0) {
      throw new Error("Bank of Abyssinia returned no valid USD rates.");
    }

    return output;
  }
}

export const abyssiniaProvider = new AbyssiniaProvider();
