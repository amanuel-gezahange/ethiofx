import type { FxRate } from "@/lib/types";
import type { RateProvider } from "./provider";

const SOURCE_URL =
  "https://display.globalforexet.com/api/public-exchange-rates";

type GlobalForexApiRate = {
  currencyCode?: string;
  currencyName?: string;
  buy?: number;
  sell?: number;
  effectiveDate?: string;
  serviceChargeValue?: number;
};

type GlobalForexApiResponse = {
  status?: string;
  code?: number;
  message?: string;
  data?: GlobalForexApiRate[];
};

export const globalForexProvider: RateProvider = {
  name: "Global Forex Bureau",
  slug: "global-forex",
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
      throw new Error(`Global Forex returned HTTP ${response.status}`);
    }

    const json = (await response.json()) as GlobalForexApiResponse;

    if (!Array.isArray(json.data)) {
      throw new Error("Global Forex returned an invalid API response");
    }

    const usd = json.data.find(
      (rate) => rate.currencyCode?.trim().toUpperCase() === "USD"
    );

    if (!usd) {
      throw new Error("Could not find Global Forex USD rate");
    }

    const buy = Number(usd.buy);
    const sell = Number(usd.sell);

    if (!Number.isFinite(buy) || !Number.isFinite(sell)) {
      throw new Error(
        `Could not parse Global Forex USD rates: buy=${usd.buy}, sell=${usd.sell}`
      );
    }

    if (buy <= 0 || sell <= 0) {
      throw new Error(
        `Global Forex returned invalid USD rates: buy=${buy}, sell=${sell}`
      );
    }

    if (sell < buy) {
      throw new Error(
        `Global Forex USD rates look invalid: buy=${buy}, sell=${sell}`
      );
    }

    const fetchedAt = new Date().toISOString();

    /*
     * Global Forex publishes an effectiveDate such as:
     *
     * 2026-08-29
     *
     * Treat that as midnight in Ethiopia (+03:00), rather
     * than midnight UTC.
     */
    const effectiveAt = usd.effectiveDate
      ? new Date(`${usd.effectiveDate}T00:00:00+03:00`).toISOString()
      : null;

    return [
      {
        bank: "Global Forex Bureau",
        slug: "global-forex",
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
