import * as cheerio from "cheerio";

import type { FxRate } from "@/lib/types";
import type { RateProvider } from "./provider";

const SOURCE_URL = "https://hijra-bank.com/";

function parseRate(value: string | undefined): number | null {
  if (!value) return null;

  const parsed = Number.parseFloat(
    value.replace(/,/g, "").trim()
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

function parseEffectiveDate(
  value: string | null
): string | null {
  if (!value) return null;

  const match = value
    .trim()
    .match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2})$/);

  if (!match) return null;

  const day = Number(match[1]);
  const monthName = match[2].toLowerCase();
  const year = 2000 + Number(match[3]);

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

  const month = months[monthName];

  if (month === undefined) {
    return null;
  }

  const date = new Date(
    Date.UTC(year, month, day)
  );

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  const mm = String(month + 1).padStart(2, "0");
  const dd = String(day).padStart(2, "0");

  return new Date(
    `${year}-${mm}-${dd}T00:00:00+03:00`
  ).toISOString();
}

async function fetchPage(): Promise<string> {
  const response = await fetch(SOURCE_URL, {
    cache: "no-store",
    headers: {
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36"
    }
  });

  if (!response.ok) {
    throw new Error(
      `Hijra Bank returned HTTP ${response.status}`
    );
  }

  return response.text();
}

function extractUsdRate(
  $: cheerio.CheerioAPI
): {
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

    const cells = $(row).find("td");

    if (cells.length < 5) {
      return;
    }

    const values = cells
      .map((__, cell) =>
        $(cell)
          .text()
          .replace(/\s+/g, " ")
          .trim()
      )
      .get();

    const currency =
      values[0]?.toLowerCase();

    if (
      currency !== "us dollar" &&
      currency !== "usd"
    ) {
      return;
    }

    const cashBuy =
      parseRate(values[1]);

    const cashSell =
      parseRate(values[2]);

    const transactionBuy =
      parseRate(values[3]);

    const transactionSell =
      parseRate(values[4]);

    if (
      !validPair(cashBuy, cashSell) ||
      !validPair(
        transactionBuy,
        transactionSell
      )
    ) {
      return;
    }

    result = {
      cashBuy,
      cashSell: cashSell!,
      transactionBuy,
      transactionSell:
        transactionSell!
    };
  });

  return result;
}

function extractEffectiveDate(
  $: cheerio.CheerioAPI
): string | null {
  const text = $(".exchange-sub")
    .first()
    .text()
    .replace(/\s+/g, " ")
    .trim();

  const match = text.match(
    /Applicable\s+on\s+(.+)/i
  );

  return match?.[1]?.trim() ?? null;
}

export class HijraProvider
  implements RateProvider
{
  readonly name = "Hijra Bank";
  readonly slug = "hijra";
  readonly sourceUrl = SOURCE_URL;

  async fetchRates(): Promise<FxRate[]> {
    const html = await fetchPage();

    const $ = cheerio.load(html);

    const usd = extractUsdRate($);

    if (!usd) {
      throw new Error(
        "Hijra Bank page did not contain a valid US Dollar exchange-rate row."
      );
    }

    const fetchedAt =
      new Date().toISOString();

    const sourceDate =
      extractEffectiveDate($);

    const effectiveAt =
      parseEffectiveDate(sourceDate) ??
      fetchedAt;

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

    console.log(
      "[hijra-output]",
      {
        sourceDate,
        rates: rates.map((rate) => ({
          rateType: rate.rateType,
          buy: rate.buy,
          sell: rate.sell
        }))
      }
    );

    return rates;
  }
}

export const hijraProvider =
  new HijraProvider();