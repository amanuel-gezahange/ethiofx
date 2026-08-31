import type { FxRate } from "@/lib/types";
import type { RateProvider } from "./provider";

const SOURCE_URL = "https://graceforexbureau.com/api/rates/current";

type GraceApiRate = {
  currency_id?: string;
  currency?: string;
  name?: string;
  symbol?: string;
  buying_rate?: string | number;
  selling_rate?: string | number;
  is_locked?: boolean;
  source?: string;
  last_updated?: string;
};

type GraceApiResponse = {
  success?: boolean;
  data?: GraceApiRate[];
  fetched_at?: string;
};

function parseNumber(value: string | number | undefined) {
  if (value === undefined) {
    return null;
  }

  const number = Number(value);

  return Number.isFinite(number) ? number : null;
}

export const graceProvider: RateProvider = {
  name: "Grace General Forex Bureau",
  slug: "grace",
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
      throw new Error(`Grace Forex returned HTTP ${response.status}`);
    }

    const json = (await response.json()) as GraceApiResponse;

    if (!json.success || !Array.isArray(json.data)) {
      throw new Error("Grace Forex returned an invalid API response");
    }

    const usd = json.data.find(
      (rate) => rate.currency?.trim().toUpperCase() === "USD"
    );

    if (!usd) {
      throw new Error("Could not find Grace Forex USD rate");
    }

    const buy = parseNumber(usd.buying_rate);
    const sell = parseNumber(usd.selling_rate);

    if (buy === null || sell === null) {
      throw new Error(
        `Could not parse Grace USD rates: buy=${usd.buying_rate}, sell=${usd.selling_rate}`
      );
    }

    if (buy <= 0 || sell <= 0) {
      throw new Error(
        `Grace returned invalid USD rates: buy=${buy}, sell=${sell}`
      );
    }

    if (sell < buy) {
      throw new Error(`Grace USD rates look invalid: buy=${buy}, sell=${sell}`);
    }

    if (buy < 100 || buy > 300 || sell < 100 || sell > 300) {
      throw new Error(
        `Grace USD rates are outside expected range: buy=${buy}, sell=${sell}`
      );
    }

    const fetchedAt =
      json.fetched_at && Number.isFinite(new Date(json.fetched_at).getTime())
        ? new Date(json.fetched_at).toISOString()
        : new Date().toISOString();

    const effectiveAt =
      usd.last_updated && Number.isFinite(new Date(usd.last_updated).getTime())
        ? new Date(usd.last_updated).toISOString()
        : null;

    return [
      {
        bank: "Grace General Forex Bureau",
        slug: "grace",
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
