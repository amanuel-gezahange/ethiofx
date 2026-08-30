import type { FxRate } from "@/lib/types";
import type { RateProvider } from "./provider";

const SOURCE_URL =
  "https://rammisbank.et/api/v1/exchange-rates/latest?base_currency=ETB&currencies=USD";

type RammisApiRate = {
  id?: number;
  base_currency?: string;
  currency?: string;
  effective_date?: string;
  buying?: string | number;
  selling?: string | number;
};

type RammisApiResponse = {
  base_currency?: string;
  effective_date?: string;
  rates?: RammisApiRate[];
};

function parseRate(value: string | number | undefined): number | null {
  if (value === undefined) {
    return null;
  }

  const parsed =
    typeof value === "number"
      ? value
      : Number.parseFloat(value.replace(/,/g, "").trim());

  return Number.isFinite(parsed) ? parsed : null;
}

function validPair(buy: number | null, sell: number | null): buy is number {
  return buy !== null && sell !== null && buy > 0 && sell > 0 && sell >= buy;
}

function parseEffectiveDate(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const parsed = new Date(`${value}T00:00:00+03:00`);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}

async function fetchRatesApi(): Promise<RammisApiResponse> {
  const response = await fetch(SOURCE_URL, {
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36"
    }
  });

  if (!response.ok) {
    throw new Error(`Rammis Bank API returned HTTP ${response.status}`);
  }

  return response.json();
}

export class RammisProvider implements RateProvider {
  readonly name = "Rammis Bank";
  readonly slug = "rammis";
  readonly sourceUrl = SOURCE_URL;

  async fetchRates(): Promise<FxRate[]> {
    const data = await fetchRatesApi();

    const usd = data.rates?.find(
      (rate) => rate.currency?.toUpperCase() === "USD"
    );

    if (!usd) {
      throw new Error("Rammis Bank API did not return a USD exchange rate.");
    }

    const buy = parseRate(usd.buying);

    const sell = parseRate(usd.selling);

    if (!validPair(buy, sell)) {
      throw new Error("Rammis Bank API returned an invalid USD buy/sell pair.");
    }

    const fetchedAt = new Date().toISOString();

    const effectiveAt =
      parseEffectiveDate(usd.effective_date ?? data.effective_date) ??
      fetchedAt;

    const rates: FxRate[] = [
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

    console.log(
      "[rammis-output]",
      rates.map((rate) => ({
        rateType: rate.rateType,
        buy: rate.buy,
        sell: rate.sell,
        effectiveAt: rate.effectiveAt
      }))
    );

    return rates;
  }
}

export const rammisProvider = new RammisProvider();
