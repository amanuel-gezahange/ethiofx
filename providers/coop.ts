import type { FxRate } from "@/lib/types";
import type { RateProvider } from "./provider";

const SOURCE_URL = "https://coopbankoromia.com.et/daily-exchange-rates/";

type CoopCurrencyRate = {
  buying?: string | number;
  selling?: string | number;
  transaction_buying?: string | number;
  transaction_selling?: string | number;
};

type CoopRates = Record<string, CoopCurrencyRate>;

function parseRate(value: unknown): number | null {
  const rate =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : NaN;

  return Number.isFinite(rate) && rate > 0 ? rate : null;
}

function validPair(buy: number | null, sell: number | null): buy is number {
  return buy !== null && sell !== null && sell > buy;
}

function extractRates(html: string): CoopRates {
  const marker = "var exchangeRates =";
  const markerIndex = html.indexOf(marker);

  if (markerIndex === -1) {
    throw new Error(
      "Cooperative Bank page did not contain exchangeRates data."
    );
  }

  const objectStart = html.indexOf("{", markerIndex);

  if (objectStart === -1) {
    throw new Error(
      "Cooperative Bank exchangeRates object could not be located."
    );
  }

  let depth = 0;
  let inString = false;
  let escaped = false;
  let objectEnd = -1;

  for (let i = objectStart; i < html.length; i++) {
    const char = html[i];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === "\\") {
        escaped = true;
        continue;
      }

      if (char === '"') {
        inString = false;
      }

      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === "{") {
      depth++;
    } else if (char === "}") {
      depth--;

      if (depth === 0) {
        objectEnd = i + 1;
        break;
      }
    }
  }

  if (objectEnd === -1) {
    throw new Error("Cooperative Bank exchangeRates object was incomplete.");
  }

  const json = html.slice(objectStart, objectEnd);

  const parsed: unknown = JSON.parse(json);

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(
      "Cooperative Bank exchangeRates data had an invalid format."
    );
  }

  return parsed as CoopRates;
}

function extractEffectiveDate(html: string): string | null {
  const match = html.match(
    /name=["']er_date["'][^>]*value=["'](\d{4}-\d{2}-\d{2})["']/
  );

  return match?.[1] ?? null;
}

async function fetchWithRetry(
  url: string,
  attempts = 3
): Promise<Response> {
  let lastStatus: number | null = null;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          Accept: "text/html",
          "User-Agent": "Mozilla/5.0 (compatible; EthioFX/1.0; exchange-rate-monitor)"
        },
        cache: "no-store"
      });

      if (response.ok) return response;

      lastStatus = response.status;

      if (response.status >= 400 && response.status < 500) {
        throw new Error(`Cooperative Bank returned HTTP ${response.status}`);
      }
    } catch (error) {
      if (attempt === attempts) throw error;
    }

    if (attempt < attempts) {
      await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
    }
  }

  throw new Error(
    `Cooperative Bank returned HTTP ${lastStatus ?? "unknown"} after ${attempts} attempts`
  );
}

export class CoopProvider implements RateProvider {
  readonly name = "Cooperative Bank of Oromia";
  readonly slug = "coop";
  readonly sourceUrl = SOURCE_URL;

  async fetchRates(): Promise<FxRate[]> {
    const response = await fetchWithRetry(SOURCE_URL);

    const html = await response.text();

    const rates = extractRates(html);
    const date = extractEffectiveDate(html);

    if (!date) {
      throw new Error(
        "Cooperative Bank page did not contain an effective date."
      );
    }

    const usd = rates.USD;

    if (!usd) {
      throw new Error("Cooperative Bank page contained no USD exchange rate.");
    }

    const effectiveAt = new Date(`${date}T00:00:00+03:00`).toISOString();

    const fetchedAt = new Date().toISOString();

    const output: FxRate[] = [];

    const cashBuy = parseRate(usd.buying);
    const cashSell = parseRate(usd.selling);

    if (validPair(cashBuy, cashSell)) {
      output.push({
        bank: this.name,
        slug: this.slug,
        currency: "USD",
        buy: cashBuy,
        sell: cashSell!,
        rateType: "cash",
        sourceUrl: SOURCE_URL,
        effectiveAt,
        fetchedAt
      });
    }

    const transactionBuy = parseRate(usd.transaction_buying);

    const transactionSell = parseRate(usd.transaction_selling);

    if (validPair(transactionBuy, transactionSell)) {
      output.push({
        bank: this.name,
        slug: this.slug,
        currency: "USD",
        buy: transactionBuy,
        sell: transactionSell!,
        rateType: "transaction",
        sourceUrl: SOURCE_URL,
        effectiveAt,
        fetchedAt
      });
    }

    const usdTransaction = output.find(
      (rate) => rate.currency === "USD" && rate.rateType === "transaction"
    );

    if (!usdTransaction) {
      throw new Error(
        "Cooperative Bank returned no valid USD transactional rate."
      );
    }

    return output;
  }
}

export const coopProvider = new CoopProvider();