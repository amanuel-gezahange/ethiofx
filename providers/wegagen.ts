import type { FxRate } from "@/lib/types";
import type { RateProvider } from "./provider";

const SOURCE_URL =
  "https://weg.back.strapi.wegagen.com/api/exchange-rates?populate=*";

type WegagenAttributes = {
  date?: string;
  code?: string;
  unit?: number;
  buying?: number;
  selling?: number;
  tra_buying?: number;
  tra_selling?: number;
};

type WegagenItem = {
  id?: number;
  attributes?: WegagenAttributes;
};

type WegagenResponse = {
  data?: WegagenItem[];
};

function validPair(
  buy: unknown,
  sell: unknown
): buy is number {
  return (
    typeof buy === "number" &&
    Number.isFinite(buy) &&
    buy > 0 &&
    typeof sell === "number" &&
    Number.isFinite(sell) &&
    sell > buy
  );
}

function normalizeCurrency(code: string) {
  const normalized = code.trim().toUpperCase();

  if (normalized === "EURO") {
    return "EUR";
  }

  return normalized;
}

function effectiveAt(date?: string): string | null {
  if (!date) return null;

  const parsed = new Date(`${date}T00:00:00+03:00`);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}

export class WegagenProvider implements RateProvider {
  readonly name = "Wegagen Bank";
  readonly slug = "wegagen";
  readonly sourceUrl = SOURCE_URL;

  async fetchRates(): Promise<FxRate[]> {
    const response = await fetch(SOURCE_URL, {
      headers: {
        Accept: "application/json",
        "User-Agent": "EthioFX/0.1",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(
        `Wegagen API returned HTTP ${response.status}`
      );
    }

    const payload =
      (await response.json()) as WegagenResponse;

    if (!Array.isArray(payload.data)) {
      throw new Error(
        "Wegagen API did not return a data array."
      );
    }

    const fetchedAt = new Date().toISOString();
    const output: FxRate[] = [];

    for (const item of payload.data) {
      const a = item.attributes;

      if (!a?.code) {
        continue;
      }

      const currency = normalizeCurrency(a.code);

      if (!/^[A-Z]{3}$/.test(currency)) {
        console.warn(
          "[Wegagen] skipping unknown currency",
          a.code
        );
        continue;
      }

      const unit =
        typeof a.unit === "number" && a.unit > 0
          ? a.unit
          : 1;

      /*
       * Normalize everything to ETB per 1 unit of
       * foreign currency.
       */
      const cashBuy =
        typeof a.buying === "number"
          ? a.buying / unit
          : undefined;

      const cashSell =
        typeof a.selling === "number"
          ? a.selling / unit
          : undefined;

      const transactionBuy =
        typeof a.tra_buying === "number"
          ? a.tra_buying / unit
          : undefined;

      const transactionSell =
        typeof a.tra_selling === "number"
          ? a.tra_selling / unit
          : undefined;

      if (validPair(transactionBuy, transactionSell)) {
        output.push({
          bank: this.name,
          slug: this.slug,
          currency,
          buy: transactionBuy,
          sell: transactionSell,
          rateType: "transaction",
          sourceUrl: SOURCE_URL,
          effectiveAt: effectiveAt(a.date),
          fetchedAt,
        });
      }

      if (validPair(cashBuy, cashSell)) {
        output.push({
          bank: this.name,
          slug: this.slug,
          currency,
          buy: cashBuy,
          sell: cashSell,
          rateType: "cash",
          sourceUrl: SOURCE_URL,
          effectiveAt: effectiveAt(a.date),
          fetchedAt,
        });
      }
    }

    const usd = output.find(
      (rate) =>
        rate.currency === "USD" &&
        rate.rateType === "transaction"
    );

    if (!usd) {
      throw new Error(
        "Wegagen returned no valid USD transactional rate."
      );
    }

    return output;
  }
}

export const wegagenProvider = new WegagenProvider();