import * as cheerio from "cheerio";

import type { FxRate } from "@/lib/types";
import type { RateProvider } from "./provider";

const SOURCE_URL = "https://oromiabank.com/";

type UsdCandidate = {
  buy: number;
  sell: number;
  date: string | null;
};

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

function parseDate(value: string): Date | null {
  const match = value
    .trim()
    .match(
      /^(\d{1,2})[\/\-\s](\d{1,2})[\/\-\s](\d{4})$/
    );

  if (!match) {
    return null;
  }

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);

  const date = new Date(
    Date.UTC(
      year,
      month - 1,
      day
    )
  );

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date;
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
      `Oromia Bank returned HTTP ${response.status}`
    );
  }

  return response.text();
}

function extractUsdRate(
  $: cheerio.CheerioAPI
): UsdCandidate | null {
  const candidates: UsdCandidate[] = [];

  $("tr").each((_, row) => {
    const cells = $(row).find("td");

    if (cells.length < 3) {
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

    const currency = values[0]
      ?.trim()
      .toUpperCase();

    if (currency !== "USD") {
      return;
    }

    /*
      Oromia currently exposes rows such as:

      USD | 159.6209 | 162.8133

      Historical tables can instead look like:

      USD | DOLLAR | 160.xxxx | 164.xxxx | 27/08/2026
    */

    let buy: number | null = null;
    let sell: number | null = null;
    let date: string | null = null;

    if (
      values[1]?.toUpperCase() === "DOLLAR" &&
      values.length >= 4
    ) {
      buy = parseRate(values[2]);
      sell = parseRate(values[3]);

      if (
        values[4] &&
        parseDate(values[4])
      ) {
        date = values[4];
      }
    } else {
      buy = parseRate(values[1]);
      sell = parseRate(values[2]);

      /*
        Some table variants may append a date after
        the buying/selling columns.
      */
      for (const value of values.slice(3)) {
        if (parseDate(value)) {
          date = value;
          break;
        }
      }
    }

    if (!validPair(buy, sell)) {
      return;
    }

    candidates.push({
      buy,
      sell: sell!,
      date
    });
  });

  if (candidates.length === 0) {
    return null;
  }

  /*
    Prefer the most recent explicitly dated row.
  */
  const datedCandidates = candidates
    .filter(
      (
        candidate
      ): candidate is UsdCandidate & {
        date: string;
      } => Boolean(
        candidate.date &&
        parseDate(candidate.date)
      )
    )
    .sort((a, b) => {
      const aTime =
        parseDate(a.date)?.getTime() ?? 0;

      const bTime =
        parseDate(b.date)?.getTime() ?? 0;

      return bTime - aTime;
    });

  if (datedCandidates.length > 0) {
    return datedCandidates[0];
  }

  /*
    Oromia's current compact rate table may have no
    date column. In that case use the last valid USD
    row encountered in the document.
  */
  return candidates[candidates.length - 1];
}

function makeEffectiveAt(
  date: string | null,
  fetchedAt: string
): string {
  if (!date) {
    return fetchedAt;
  }

  const parsed = parseDate(date);

  if (!parsed) {
    return fetchedAt;
  }

  const year =
    parsed.getUTCFullYear();

  const month = String(
    parsed.getUTCMonth() + 1
  ).padStart(2, "0");

  const day = String(
    parsed.getUTCDate()
  ).padStart(2, "0");

  return new Date(
    `${year}-${month}-${day}T00:00:00+03:00`
  ).toISOString();
}

export class OromiaProvider
  implements RateProvider
{
  readonly name = "Oromia Bank";

  readonly slug = "oromia";

  readonly sourceUrl = SOURCE_URL;

  async fetchRates(): Promise<FxRate[]> {
    const html = await fetchPage();

    const $ = cheerio.load(html);

    const usd = extractUsdRate($);

    if (!usd) {
      throw new Error(
        "Oromia Bank page did not contain a valid USD exchange-rate row."
      );
    }

    const fetchedAt =
      new Date().toISOString();

    const effectiveAt =
      makeEffectiveAt(
        usd.date,
        fetchedAt
      );

    const rates: FxRate[] = [
      {
        bank: this.name,
        slug: this.slug,
        currency: "USD",
        buy: usd.buy,
        sell: usd.sell,
        rateType: "cash",
        sourceUrl: this.sourceUrl,
        effectiveAt,
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
        effectiveAt,
        fetchedAt
      }
    ];

    console.log("[oromia-output]", {
      sourceDate: usd.date,
      rates: rates.map((rate) => ({
        rateType: rate.rateType,
        buy: rate.buy,
        sell: rate.sell
      }))
    });

    return rates;
  }
}

export const oromiaProvider =
  new OromiaProvider();