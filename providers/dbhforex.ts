import type { FxRate } from "@/lib/types";
import type { RateProvider } from "./provider";

const SOURCE_URL = "https://dbhforex.com/";
const API_URL = "https://dbh.gudalabs.com/api/currencyrates";

type DbhRate = {
  branch_id?: number;
  buying_price?: string | number | null;
  selling_price?: string | number | null;
  effective_date?: string | null;
  updated_at?: string | null;
  branch?: {
    id?: number;
    name?: string;
  };
  currency?: {
    id?: number;
    code?: string;
    name?: string;
  };
};

type DbhResponse = {
  success?: boolean;
  data?: DbhRate[];
};

function parseNumber(value: string | number | null | undefined) {
  const number =
    typeof value === "number"
      ? value
      : Number(
          String(value ?? "")
            .replace(/,/g, "")
            .trim()
        );

  return Number.isFinite(number) ? number : null;
}

function parseEffectiveDate(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  // DBH sends values such as:
  // 2025-03-21 20:17:00
  // Treat the displayed DBH time as Ethiopia local time.
  const normalized = value.includes("T") ? value : value.replace(" ", "T");

  const timestamp = new Date(
    /(?:Z|[+-]\d{2}:\d{2})$/i.test(normalized)
      ? normalized
      : `${normalized}+03:00`
  );

  if (!Number.isFinite(timestamp.getTime())) {
    return null;
  }

  return timestamp.toISOString();
}

export const dbhForexProvider: RateProvider = {
  name: "DBH Forex Bureau",
  slug: "dbhforex",
  sourceUrl: SOURCE_URL,

  async fetchRates(): Promise<FxRate[]> {
    const response = await fetch(API_URL, {
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "User-Agent":
          "Mozilla/5.0 (compatible; EthioFX/1.0; +https://ethiofx.com)"
      }
    });

    if (!response.ok) {
      throw new Error(`DBH returned HTTP ${response.status}`);
    }

    const payload = (await response.json()) as DbhResponse;

    if (!payload.success || !Array.isArray(payload.data)) {
      throw new Error("DBH returned an invalid API response");
    }

    /*
     * DBH exposes multiple branches.
     * The public website currently displays DBH Main,
     * so explicitly select that branch.
     */
    const usd = payload.data.find(
      (rate) =>
        rate.currency?.code?.toUpperCase() === "USD" &&
        rate.branch?.name?.trim().toLowerCase() === "dbh main"
    );

    if (!usd) {
      throw new Error("Could not find DBH Main USD rate");
    }

    const buy = parseNumber(usd.buying_price);
    const sell = parseNumber(usd.selling_price);

    if (buy === null || sell === null) {
      throw new Error("Could not parse DBH USD buy/sell rates");
    }

    if (buy <= 0 || sell <= 0 || sell < buy) {
      throw new Error(`DBH USD rates look invalid: buy=${buy}, sell=${sell}`);
    }

    return [
      {
        bank: "DBH Forex Bureau",
        slug: "dbhforex",
        currency: "USD",
        buy,
        sell,
        rateType: "cash",
        sourceUrl: SOURCE_URL,
        effectiveAt: parseEffectiveDate(usd.effective_date),
        fetchedAt: new Date().toISOString()
      }
    ];
  }
};
