import type { FxRate } from "@/lib/types";
import type { RateProvider } from "./provider";

const SOURCE_URL = "https://www.roohaforex.net/";
const API_URL = "https://www.roohaforex.net/api/public-exchange-rates";

type RoohaApiRate = {
  currencyCode: string;
  currencyName: string;
  buy: number;
  sell: number;
  effectiveDate: string;
  serviceChargeValue: number;
};

type RoohaApiResponse = {
  status: string;
  code: number;
  message: string;
  data: RoohaApiRate[];
};

function parseEffectiveDate(value: string | null | undefined): string | null {
  if (!value) return null;

  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) return null;

  const parsed = new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00+03:00`);

  if (!Number.isFinite(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}

export const roohaProvider: RateProvider = {
  name: "Rooha Forex Bureau",
  slug: "rooha",
  sourceUrl: SOURCE_URL,

  async fetchRates(): Promise<FxRate[]> {
    const response = await fetch(API_URL, {
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 (compatible; EthioFX/1.0)"
      }
    });

    if (!response.ok) {
      throw new Error(`Rooha API returned HTTP ${response.status}`);
    }

    const payload = (await response.json()) as RoohaApiResponse;

    if (payload.status !== "success" || !Array.isArray(payload.data)) {
      throw new Error(
        `Rooha API returned an unexpected response: ${payload.message ?? "unknown"}`
      );
    }

    const usd = payload.data.find(
      (rate) => rate.currencyCode?.toUpperCase() === "USD"
    );

    if (!usd) {
      throw new Error("Rooha API did not contain a USD rate");
    }

    const buy = Number(usd.buy);
    const sell = Number(usd.sell);

    if (
      !Number.isFinite(buy) ||
      !Number.isFinite(sell) ||
      buy <= 0 ||
      sell <= 0 ||
      sell < buy
    ) {
      throw new Error(`Rooha USD rates look invalid: buy=${buy}, sell=${sell}`);
    }

    const fetchedAt = new Date().toISOString();

    const effectiveAt = parseEffectiveDate(usd.effectiveDate);

    return [
      {
        bank: "Rooha Forex Bureau",
        slug: "rooha",
        currency: "USD",
        buy,
        sell,
        rateType: "cash",
        sourceUrl: SOURCE_URL,
        effectiveAt,
        fetchedAt
      }
    ];
  }
};
