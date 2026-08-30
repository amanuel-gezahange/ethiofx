import * as cheerio from "cheerio";

import type { FxRate } from "@/lib/types";
import type { RateProvider } from "./provider";

const SOURCE_URL = "https://www.gohbetbank.com/";

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
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36"
    }
  });

  if (!response.ok) {
    throw new Error(`Goh Betoch Bank returned HTTP ${response.status}`);
  }

  return response.text();
}

function extractFromTable($: cheerio.CheerioAPI): {
  buy: number;
  sell: number;
} | null {
  let result: {
    buy: number;
    sell: number;
  } | null = null;

  $("tr").each((_, row) => {
    if (result) return;

    const rowText = $(row).text().replace(/\s+/g, " ").trim();

    if (!/\bUSD\b/i.test(rowText)) {
      return;
    }

    const cells = $(row).find("td");

    const values = cells
      .map((__, cell) => $(cell).text().replace(/\s+/g, " ").trim())
      .get();

    console.log("[goh-debug-row]", values);

    /*
      Expected logical structure:

      [
        "USD",
        "161.7128",
        "164.9471",
        "161.7128",
        "166.4471"
      ]

      But the first cell may also contain image/lazy-load
      markup, so we don't depend on exact cell count.
    */

    const numericValues = values
      .slice(1)
      .map((value) => parseRate(value))
      .filter((value): value is number => value !== null && value > 10);

    if (numericValues.length < 2) {
      return;
    }

    const buy = numericValues[0];
    const sell = numericValues[1];

    if (!validPair(buy, sell)) {
      return;
    }

    result = {
      buy,
      sell
    };
  });

  return result;
}

function extractFromRawHtml(html: string): {
  buy: number;
  sell: number;
} | null {
  /*
    Fallback for Goh's generated Elementor table.

    We only care about the first two numeric values
    following the USD cell:

      USD -> buying -> selling
  */

  const usdIndex = html.search(/<strong[^>]*>\s*USD\s*<\/strong>/i);

  if (usdIndex < 0) {
    return null;
  }

  const section = html.slice(usdIndex, usdIndex + 2500);

  const text = cheerio.load(section).text().replace(/\s+/g, " ").trim();

  const usdPosition = text.toUpperCase().indexOf("USD");

  if (usdPosition < 0) {
    return null;
  }

  const afterUsd = text.slice(usdPosition + 3);

  const numbers = afterUsd.match(/\d{2,3}(?:\.\d+)?/g) ?? [];

  const rates = numbers
    .map((value) => parseRate(value))
    .filter((value): value is number => value !== null && value > 10);

  if (rates.length < 2) {
    return null;
  }

  const buy = rates[0];
  const sell = rates[1];

  if (!validPair(buy, sell)) {
    return null;
  }

  return {
    buy,
    sell
  };
}

export class GohProvider implements RateProvider {
  readonly name = "Goh Betoch Bank";

  readonly slug = "goh";

  readonly sourceUrl = SOURCE_URL;

  async fetchRates(): Promise<FxRate[]> {
    const html = await fetchPage();

    const $ = cheerio.load(html);

    const fromTable = extractFromTable($);

    const fromRawHtml = fromTable ? null : extractFromRawHtml(html);

    const usd = fromTable ?? fromRawHtml;

    console.log("[goh-debug]", {
      htmlLength: html.length,
      foundTable: Boolean(fromTable),
      foundRawHtml: Boolean(fromRawHtml)
    });

    if (!usd) {
      throw new Error(
        "Goh Betoch Bank page did not contain a valid USD exchange-rate row."
      );
    }

    const fetchedAt = new Date().toISOString();

    const rates: FxRate[] = [
      {
        bank: this.name,
        slug: this.slug,
        currency: "USD",
        buy: usd.buy,
        sell: usd.sell,
        rateType: "cash",
        sourceUrl: this.sourceUrl,
        effectiveAt: null,
        fetchedAt
      },
      {
        bank: this.name,
        slug: this.slug,
        currency: "USD",
        buy: usd.buy,
        sell: usd.sell,
        rateType: "transaction",
        sourceUrl: this.sourceUrl,
        effectiveAt: null,
        fetchedAt
      }
    ];

    console.log(
      "[goh-output]",
      rates.map((rate) => ({
        rateType: rate.rateType,
        buy: rate.buy,
        sell: rate.sell
      }))
    );

    return rates;
  }
}

export const gohProvider = new GohProvider();