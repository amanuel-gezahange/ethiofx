import type { FxRate } from "@/lib/types";
import type { RateProvider } from "./provider";

const PAGE_URL = "https://awashbank.com/exchange-historical/";
const AJAX_URL = "https://awashbank.com/wp-admin/admin-ajax.php";

type AwashUsdRate = {
  buying?: string;
  selling?: string;
  transaction_buying?: string;
  transaction_selling?: string;
};

type AwashResponse = {
  success?: boolean;
  data?: {
    rates?: {
      USD?: AwashUsdRate;
    };
    date?: string;
  };
};

function parseRate(value: string | undefined): number | null {
  if (!value) return null;

  const parsed = Number.parseFloat(value.replace(/,/g, "").trim());

  return Number.isFinite(parsed) ? parsed : null;
}

function validPair(
  buy: number | null,
  sell: number | null
): buy is number {
  return (
    buy !== null &&
    sell !== null &&
    buy > 0 &&
    sell > 0 &&
    sell >= buy
  );
}

function extractNonce(html: string): string | null {
  // Try common WordPress/plugin nonce formats.
  const patterns = [
    /["']nonce["']\s*:\s*["']([^"']+)["']/i,
    /["']nonce["']\s*=\s*["']([^"']+)["']/i,
    /nonce\s*:\s*["']([^"']+)["']/i,
    /data-nonce=["']([^"']+)["']/i
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);

    if (match?.[1]) {
      return match[1];
    }
  }

  return null;
}

async function fetchPage(): Promise<string> {
  const response = await fetch(PAGE_URL, {
    cache: "no-store",
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "User-Agent":
        "Mozilla/5.0 (compatible; EthioFX/1.0; exchange-rate-monitor)"
    }
  });

  if (!response.ok) {
    throw new Error(
      `Awash Bank page returned HTTP ${response.status}`
    );
  }

  return response.text();
}

async function fetchAwashRates(
  nonce: string
): Promise<AwashResponse> {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Addis_Ababa",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());

  const body = new URLSearchParams({
    action: "get_exchange_rates",
    nonce,
    shortcode_type: "exchange_rates",
    is_user_selected: "false",
    _timestamp: Date.now().toString(),
    date: today,
    title: "Exchange Rates"
  });

  const response = await fetch(AJAX_URL, {
    method: "POST",
    cache: "no-store",
    headers: {
      Accept: "application/json, text/javascript, */*; q=0.01",
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "User-Agent":
        "Mozilla/5.0 (compatible; EthioFX/1.0; exchange-rate-monitor)",
      Referer: PAGE_URL,
      "X-Requested-With": "XMLHttpRequest"
    },
    body
  });

  if (!response.ok) {
    throw new Error(
      `Awash Bank API returned HTTP ${response.status}`
    );
  }

  const json = (await response.json()) as AwashResponse;

  if (!json.success) {
    throw new Error("Awash Bank API returned success=false.");
  }

  return json;
}

export class AwashProvider implements RateProvider {
  readonly name = "Awash Bank";
  readonly slug = "awash";
  readonly sourceUrl = PAGE_URL;

  async fetchRates(): Promise<FxRate[]> {
    const html = await fetchPage();

    const nonce = extractNonce(html);

    if (!nonce) {
      throw new Error(
        "Awash Bank page did not contain an exchange-rate nonce."
      );
    }

    const json = await fetchAwashRates(nonce);

    const usd = json.data?.rates?.USD;

    if (!usd) {
      throw new Error(
        "Awash Bank API returned no USD exchange rate."
      );
    }

    const cashBuy = parseRate(usd.buying);
    const cashSell = parseRate(usd.selling);

    const transactionBuy = parseRate(
      usd.transaction_buying
    );
    const transactionSell = parseRate(
      usd.transaction_selling
    );

    const fetchedAt = new Date().toISOString();

    const date = json.data?.date;

    const effectiveAt = date
      ? new Date(`${date}T00:00:00+03:00`).toISOString()
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
      throw new Error(
        "Awash Bank returned no valid USD rates."
      );
    }

    return output;
  }
}

export const awashProvider = new AwashProvider();