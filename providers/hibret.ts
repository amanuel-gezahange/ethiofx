import * as cheerio from "cheerio";
import type { FxRate } from "@/lib/types";
import type { RateProvider } from "./provider";
import { Agent } from "undici";

const SOURCE_URL =
  "https://www.hibretbank.com.et/hibret-banks-daily-exchange-rate/";

const insecureDispatcher = new Agent({
  connect: {
    rejectUnauthorized: false
  }
});

function parseRate(value: string | undefined): number | null {
  if (!value) return null;

  const cleaned = value.replace(/,/g, "").trim();
  const parsed = Number.parseFloat(cleaned);

  return Number.isFinite(parsed) ? parsed : null;
}

function validPair(buy: number | null, sell: number | null): buy is number {
  return buy !== null && sell !== null && buy > 0 && sell > 0 && sell >= buy;
}

function extractEffectiveDate($: cheerio.CheerioAPI): string | null {
  const text = $("#exchange-rate .heading-date").first().text().trim();

  if (!text) return null;

  // Example: "20 AUG, 2026"
  const parsed = new Date(`${text} 00:00:00 GMT+0300`);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}

export class HibretProvider implements RateProvider {
  readonly name = "Hibret Bank";
  readonly slug = "hibret";
  readonly sourceUrl = SOURCE_URL;

  async fetchRates(): Promise<FxRate[]> {
    const response = await fetch(this.sourceUrl, {
      cache: "no-store",
      headers: {
        Accept: "text/html",
        "User-Agent":
          "Mozilla/5.0 (compatible; EthioFX/1.0; exchange-rate-monitor)"
      },
      dispatcher: insecureDispatcher
    } as RequestInit & { dispatcher: Agent });

    if (!response.ok) {
      throw new Error(`Hibret Bank returned HTTP ${response.status}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    const effectiveAt = extractEffectiveDate($);

    if (!effectiveAt) {
      throw new Error("Hibret Bank page did not contain an effective date.");
    }

    let buy: number | null = null;
    let sell: number | null = null;

    $("#exchange-rate tr").each((_, row) => {
      const cells = $(row).find("td");

      if (cells.length < 3) return;

      const currencyText = $(cells[0])
        .text()
        .replace(/\s+/g, " ")
        .trim()
        .toUpperCase();

      if (!/\bUSD\b/.test(currencyText)) {
        return;
      }

      buy = parseRate($(cells[1]).text());
      sell = parseRate($(cells[2]).text());
    });

    if (!validPair(buy, sell)) {
      throw new Error("Hibret Bank returned no valid USD exchange rate.");
    }

    const fetchedAt = new Date().toISOString();

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
      },
      {
        bank: this.name,
        slug: this.slug,
        currency: "USD",
        buy,
        sell: sell!,
        rateType: "transaction",
        sourceUrl: this.sourceUrl,
        effectiveAt,
        fetchedAt
      }
    ];
  }
}
