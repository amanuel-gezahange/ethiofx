import type { FxRate } from "@/lib/types";
import type { RateProvider } from "./provider";

const SOURCE_URL = "https://waliaforexet.com/api/rates";

type WaliaRate = {
  currencyCode?: string;
  currencyName?: string;
  buy?: number | string;
  sell?: number | string;
  effectiveDate?: string;
  serviceChargeValue?: number | string;
};

type WaliaResponse = {
  status?: string;
  code?: number;
  message?: string;
  data?: WaliaRate[];
};

function parseNumber(value: number | string | undefined) {
  if (value === undefined) {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

export const waliaProvider: RateProvider = {
  name: "Walia Forex Bureau",
  slug: "walia",
  sourceUrl: SOURCE_URL,

  async fetchRates(): Promise<FxRate[]> {
    const response = await fetch(SOURCE_URL, {
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "User-Agent":
          "Mozilla/5.0 (compatible; EthioFX/1.0; +https://ethiofx.com)"
      }
    });

    if (!response.ok) {
      throw new Error(`Walia Forex Bureau returned HTTP ${response.status}`);
    }

    const json = (await response.json()) as WaliaResponse;

    if (json.status !== "success" || !Array.isArray(json.data)) {
      throw new Error("Walia Forex Bureau returned an invalid API response");
    }

    const usd = json.data.find(
      (rate) => rate.currencyCode?.trim().toUpperCase() === "USD"
    );

    if (!usd) {
      throw new Error("Could not find Walia Forex Bureau USD rate");
    }

    const buy = parseNumber(usd.buy);
    const sell = parseNumber(usd.sell);

    if (buy === null || sell === null) {
      throw new Error(
        `Could not parse Walia USD rates: buy=${usd.buy}, sell=${usd.sell}`
      );
    }

    if (
      buy <= 0 ||
      sell <= 0 ||
      sell < buy ||
      buy < 100 ||
      buy > 300 ||
      sell < 100 ||
      sell > 300
    ) {
      throw new Error(`Walia USD rates look invalid: buy=${buy}, sell=${sell}`);
    }

    const effectiveAt =
      usd.effectiveDate &&
      Number.isFinite(new Date(`${usd.effectiveDate}T00:00:00Z`).getTime())
        ? new Date(`${usd.effectiveDate}T00:00:00Z`).toISOString()
        : null;

    return [
      {
        bank: "Walia Forex Bureau",
        slug: "walia",
        currency: "USD",
        buy,
        sell,
        rateType: "cash",
        sourceUrl: SOURCE_URL,
        effectiveAt,
        fetchedAt: new Date().toISOString()
      }
    ];
  }
};
