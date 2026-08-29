import type { FxRate } from "@/lib/types";
import type { RateProvider } from "./provider";

const SOURCE_URL = "https://api.addisbanksc.com/api/exchange-rates";

type AddisRate = {
  id?: number;
  currency?: string;
  buying?: string;
  selling?: string;
  transactionBuying?: string;
  transactionSelling?: string;
  weightedBuying?: string | null;
  weightedSelling?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

function parseRate(value: string | undefined | null): number | null {
  if (!value) return null;

  const parsed = Number.parseFloat(value.replace(/,/g, "").trim());

  return Number.isFinite(parsed) ? parsed : null;
}

function validPair(buy: number | null, sell: number | null): buy is number {
  return buy !== null && sell !== null && buy > 0 && sell > 0 && sell >= buy;
}

async function fetchRatesPage(): Promise<AddisRate[]> {
  const response = await fetch(SOURCE_URL, {
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "User-Agent":
        "Mozilla/5.0 (compatible; EthioFX/1.0; exchange-rate-monitor)"
    }
  });

  if (!response.ok) {
    throw new Error(
      `Addis International Bank API returned HTTP ${response.status}`
    );
  }

  const json = (await response.json()) as AddisRate[];

  if (!Array.isArray(json)) {
    throw new Error(
      "Addis International Bank API returned an unexpected response."
    );
  }

  return json;
}

export class AddisProvider implements RateProvider {
  readonly name = "Addis International Bank";
  readonly slug = "addis";
  readonly sourceUrl = SOURCE_URL;

  async fetchRates(): Promise<FxRate[]> {
    const rows = await fetchRatesPage();

    const usd = rows.find(
      (row) => row.currency?.trim().toUpperCase() === "USD"
    );

    if (!usd) {
      throw new Error(
        "Addis International Bank API returned no USD exchange rate."
      );
    }

    const cashBuy = parseRate(usd.buying);
    const cashSell = parseRate(usd.selling);

    const transactionBuy = parseRate(usd.transactionBuying);

    const transactionSell = parseRate(usd.transactionSelling);

    const fetchedAt = new Date().toISOString();

    const effectiveAt =
      usd.updatedAt && !Number.isNaN(new Date(usd.updatedAt).getTime())
        ? new Date(usd.updatedAt).toISOString()
        : fetchedAt;

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
      throw new Error("Addis International Bank returned no valid USD rates.");
    }

    console.log(
      "[addis-output]",
      output.map((rate) => ({
        rateType: rate.rateType,
        buy: rate.buy,
        sell: rate.sell
      }))
    );

    return output;
  }
}

export const addisProvider = new AddisProvider();
