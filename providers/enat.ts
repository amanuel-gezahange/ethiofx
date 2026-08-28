import type { FxRate } from "@/lib/types";
import type { RateProvider } from "./provider";

const SOURCE_URL = "https://www.enatbanksc.com/";

function parseRate(value: string | undefined): number | null {
  if (!value) return null;

  const parsed = Number.parseFloat(value);

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

async function fetchPage(): Promise<string> {
  const response = await fetch(SOURCE_URL, {
    cache: "no-store",
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "User-Agent":
        "Mozilla/5.0 (compatible; EthioFX/1.0; exchange-rate-monitor)"
    }
  });

  if (!response.ok) {
    throw new Error(
      `Enat Bank page returned HTTP ${response.status}`
    );
  }

  return response.text();
}

type EnatUsd = {
  effectiveDate: string;
  buy: number;
  sell: number;
  cashBuy: number;
  cashSell: number;
};

function extractUsd(html: string): EnatUsd | null {
  const usdMatch = html.match(
    /effectiveDate\\?":\\?"(\d{4}-\d{2}-\d{2})\\?"[\s\S]{0,6000}?base\\?":\{\\?"code\\?":\\?"USD\\?"[\s\S]{0,20000}?buy\\?":\\?"([0-9.]+)\\?"[\s\S]{0,1000}?sell\\?":\\?"([0-9.]+)\\?"[\s\S]{0,1000}?cashBuy\\?":\\?"([0-9.]+)\\?"[\s\S]{0,1000}?cashSell\\?":\\?"([0-9.]+)\\?"/i
  );

  if (!usdMatch) {
    return null;
  }

  const buy = parseRate(usdMatch[2]);
  const sell = parseRate(usdMatch[3]);
  const cashBuy = parseRate(usdMatch[4]);
  const cashSell = parseRate(usdMatch[5]);

  if (
    buy === null ||
    sell === null ||
    cashBuy === null ||
    cashSell === null
  ) {
    return null;
  }

  return {
    effectiveDate: usdMatch[1],
    buy,
    sell,
    cashBuy,
    cashSell
  };
}

export class EnatProvider implements RateProvider {
  readonly name = "Enat Bank";
  readonly slug = "enat";
  readonly sourceUrl = SOURCE_URL;

  async fetchRates(): Promise<FxRate[]> {
    const html = await fetchPage();

    const usd = extractUsd(html);

    if (!usd) {
      throw new Error(
        "Enat Bank page did not contain complete USD exchange-rate data."
      );
    }

    const fetchedAt = new Date().toISOString();

    const effectiveAt = new Date(
      `${usd.effectiveDate}T00:00:00+03:00`
    ).toISOString();

    const output: FxRate[] = [];

    if (validPair(usd.cashBuy, usd.cashSell)) {
      output.push({
        bank: this.name,
        slug: this.slug,
        currency: "USD",
        buy: usd.cashBuy,
        sell: usd.cashSell,
        rateType: "cash",
        sourceUrl: this.sourceUrl,
        effectiveAt,
        fetchedAt
      });
    }

    if (validPair(usd.buy, usd.sell)) {
      output.push({
        bank: this.name,
        slug: this.slug,
        currency: "USD",
        buy: usd.buy,
        sell: usd.sell,
        rateType: "transaction",
        sourceUrl: this.sourceUrl,
        effectiveAt,
        fetchedAt
      });
    }

    if (output.length === 0) {
      throw new Error(
        "Enat Bank returned no valid USD exchange rates."
      );
    }

    console.log(
      "[enat-output]",
      output.map((rate) => ({
        rateType: rate.rateType,
        buy: rate.buy,
        sell: rate.sell
      }))
    );

    return output;
  }
}

export const enatProvider = new EnatProvider();