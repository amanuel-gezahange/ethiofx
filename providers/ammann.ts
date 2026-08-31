import type { FxRate } from "@/lib/types";
import type { RateProvider } from "./provider";

const SOURCE_URL = "https://ammannforexbureau.com/api/public-exchange-rates";

type AmmannRate = {
  currencyCode: string;
  currencyName: string;
  buy: number;
  sell: number;
  effectiveDate: string;
  serviceChargeValue: number;
  branchName: string;
  displayed: boolean;
};

type AmmannResponse = {
  status: string;
  code: number;
  message: string;
  data: AmmannRate[];
};

function parseEffectiveDate(value: string) {
  /*
   * Ammann gives us a date such as:
   *
   * 2026-08-29
   *
   * There is no time component, so treat it as the beginning
   * of that date in Ethiopia (+03:00), rather than UTC.
   */
  const timestamp = new Date(`${value}T00:00:00+03:00`);

  if (!Number.isFinite(timestamp.getTime())) {
    return null;
  }

  return timestamp.toISOString();
}

export const ammannProvider: RateProvider = {
  name: "Ammann Forex Bureau",
  slug: "ammann",
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
      throw new Error(`Ammann returned HTTP ${response.status}`);
    }

    const payload = (await response.json()) as AmmannResponse;

    if (payload.status !== "success" || !Array.isArray(payload.data)) {
      throw new Error("Ammann returned an unexpected API response");
    }

    const usdRates = payload.data.filter(
      (rate) =>
        rate.currencyCode?.toUpperCase() === "USD" && rate.displayed !== false
    );

    if (usdRates.length === 0) {
      throw new Error("Could not find Ammann USD rate");
    }

    /*
     * Ammann currently returns one USD record per branch.
     *
     * EthioFX compares institutions, not individual branches,
     * so make sure all displayed branches agree before storing
     * one institution-wide rate.
     */
    const first = usdRates[0];

    const buy = Number(first.buy);
    const sell = Number(first.sell);

    if (
      !Number.isFinite(buy) ||
      !Number.isFinite(sell) ||
      buy <= 0 ||
      sell <= 0 ||
      sell < buy
    ) {
      throw new Error(
        `Ammann returned invalid USD rates: buy=${buy}, sell=${sell}`
      );
    }

    const inconsistentBranch = usdRates.find(
      (rate) => Number(rate.buy) !== buy || Number(rate.sell) !== sell
    );

    if (inconsistentBranch) {
      throw new Error(
        `Ammann USD rates differ by branch: ${inconsistentBranch.branchName}`
      );
    }

    const fetchedAt = new Date().toISOString();

    return [
      {
        bank: "Ammann Forex Bureau",
        slug: "ammann",
        currency: "USD",
        buy,
        sell,
        rateType: "cash",
        sourceUrl: SOURCE_URL,
        effectiveAt: parseEffectiveDate(first.effectiveDate),
        fetchedAt
      }
    ];
  }
};
