import type { FxRate } from "@/lib/types";
import type { RateProvider } from "./provider";

const SOURCE_URL = "https://combanketh.et/cbeapi/daily-exchange-rates/";

type CbeCurrency = {
  CurrencyCode?: string;
  CurrencyName?: string;
};

type CbeRate = {
  cashBuying?: number;
  cashSelling?: number;
  transactionalBuying?: number;
  transactionalSelling?: number;
  currency?: CbeCurrency;
};

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

function findRateArray(value: unknown): CbeRate[] | null {
  if (Array.isArray(value)) {
    const looksLikeRates = value.some(
      (item) =>
        isRecord(item) &&
        "currency" in item &&
        ("cashBuying" in item ||
          "cashSelling" in item ||
          "transactionalBuying" in item ||
          "transactionalSelling" in item)
    );

    if (looksLikeRates) {
      return value as CbeRate[];
    }

    for (const item of value) {
      const found = findRateArray(item);

      if (found) {
        return found;
      }
    }

    return null;
  }

  if (isRecord(value)) {
    for (const child of Object.values(value)) {
      const found = findRateArray(child);

      if (found) {
        return found;
      }
    }
  }

  return null;
}

function validRate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function validPair(buy: unknown, sell: unknown): buy is number {
  return validRate(buy) && validRate(sell) && sell > buy;
}

export class CbeProvider implements RateProvider {
  readonly name = "Commercial Bank of Ethiopia";
  readonly slug = "cbe";
  readonly sourceUrl = SOURCE_URL;

  async fetchRates(): Promise<FxRate[]> {
    const response = await fetch(SOURCE_URL, {
      headers: {
        Accept: "application/json",
        "User-Agent": "EthioFX/0.1"
      },
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(`CBE API returned HTTP ${response.status}`);
    }

    const data: unknown = await response.json();

    const cbeRates = findRateArray(data);

    if (!cbeRates) {
      throw new Error(
        "CBE API response did not contain an exchange-rate array."
      );
    }

    const fetchedAt = new Date().toISOString();

    const output: FxRate[] = [];

    for (const item of cbeRates) {
      const currency = item.currency?.CurrencyCode?.trim().toUpperCase();

      if (!currency || !/^[A-Z]{3}$/.test(currency)) {
        continue;
      }

      if (validPair(item.transactionalBuying, item.transactionalSelling)) {
        output.push({
          bank: this.name,
          slug: this.slug,
          currency,
          buy: item.transactionalBuying!,
          sell: item.transactionalSelling!,
          rateType: "transaction",
          sourceUrl: SOURCE_URL,
          effectiveAt: null,
          fetchedAt
        });
      }

      if (
        validRate(item.transactionalBuying) &&
        validRate(item.transactionalSelling) &&
        item.transactionalSelling <= item.transactionalBuying
      ) {
        console.warn(`[CBE] skipping suspicious transaction pair`, {
          currency,
          buy: item.transactionalBuying,
          sell: item.transactionalSelling
        });
      }

      if (
        validRate(item.cashBuying) &&
        validRate(item.cashSelling) &&
        item.cashSelling <= item.cashBuying
      ) {
        console.warn(`[CBE] skipping suspicious cash pair`, {
          currency,
          buy: item.cashBuying,
          sell: item.cashSelling
        });
      }

      if (
        validRate(item.cashBuying) &&
        validRate(item.cashSelling) &&
        item.cashSelling <= item.cashBuying
      ) {
        console.warn(`[CBE] skipping suspicious cash pair`, {
          currency,
          buy: item.cashBuying,
          sell: item.cashSelling
        });
      }
      if (validPair(item.cashBuying, item.cashSelling)) {
        output.push({
          bank: this.name,
          slug: this.slug,
          currency,
          buy: item.cashBuying!,
          sell: item.cashSelling!,
          rateType: "cash",
          sourceUrl: SOURCE_URL,
          effectiveAt: null,
          fetchedAt
        });
      }
    }

    const usdTransaction = output.find(
      (rate) => rate.currency === "USD" && rate.rateType === "transaction"
    );

    if (!usdTransaction) {
      throw new Error("CBE API returned no valid USD transactional rate.");
    }

    return output;
  }
}

export const cbeProvider = new CbeProvider();
