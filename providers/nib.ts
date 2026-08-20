import * as cheerio from "cheerio";
import type { FxRate } from "@/lib/types";
import type { RateProvider } from "./provider";

const SOURCE_URL =
  "https://www.nibbanksc.com/exchange-rate/";

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

function extractUsdRate(html: string): {
  buy: number | null;
  sell: number | null;
} {
  const $ = cheerio.load(html);

  let buy: number | null = null;
  let sell: number | null = null;

  $("table").each((_, table) => {
    if (buy !== null && sell !== null) return;

    const tableText = normalizeText($(table).text()).toLowerCase();

    // Skip Nib's separate weighted-average table.
    if (tableText.includes("weighted average")) {
      return;
    }

    $(table)
      .find("tr")
      .each((_, row) => {
        if (buy !== null && sell !== null) return;

        const cells = $(row)
          .find("td")
          .map((_, cell) => normalizeText($(cell).text()))
          .get();

        if (cells.length < 4) return;

        const currency = cells[1]?.toUpperCase();

        if (currency !== "USD") return;

        buy = parseRate(cells[2]);
        sell = parseRate(cells[3]);
      });
  });

  return { buy, sell };
}

function extractEffectiveDate(html: string): string | null {
  const $ = cheerio.load(html);

  const text = normalizeText($.root().text());

  const match = text.match(
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}\b/i
  );

  if (!match) {
    return null;
  }

  const parsed = new Date(`${match[0]} 00:00:00 GMT+0300`);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
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
          `Nib International Bank returned HTTP ${response.status}`
        );
      }

      lastError = new Error(
        `Nib International Bank returned HTTP ${response.status}`
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
    : new Error("Nib International Bank request failed.");
}

export class NibProvider implements RateProvider {
  readonly name = "Nib International Bank";
  readonly slug = "nib";
  readonly sourceUrl = SOURCE_URL;

  async fetchRates(): Promise<FxRate[]> {
    const response = await fetchWithRetry(this.sourceUrl);
    const html = await response.text();

    const { buy, sell } = extractUsdRate(html);

    if (!validPair(buy, sell)) {
      throw new Error(
        "Nib International Bank returned no valid USD rate."
      );
    }

    const fetchedAt = new Date().toISOString();
    const effectiveAt =
      extractEffectiveDate(html) ?? fetchedAt;

    return [
      {
        bank: this.name,
        slug: this.slug,
        currency: "USD",
        buy,
        sell: sell!,
        rateType: "cash",
        sourceUrl: this.sourceUrl,
        effectiveAt,
        fetchedAt
      }
    ];
  }
}

export const nibProvider = new NibProvider();