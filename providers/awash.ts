import type { FxRate } from "@/lib/types";
import type { RateProvider } from "./provider";
import {
  getProviderNonce,
  saveProviderNonce
} from "@/lib/db/provider-state";
import { fetchFreshAwashNonce } from "@/lib/awash-browser";

const PAGE_URL = "https://awashbank.com/";
const AJAX_URL =
  "https://awashbank.com/wp-admin/admin-ajax.php";

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

function parseRate(
  value: string | undefined
): number | null {
  if (!value) return null;

  const parsed = Number.parseFloat(
    value.replace(/,/g, "").trim()
  );

  return Number.isFinite(parsed)
    ? parsed
    : null;
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

function extractNonce(
  html: string
): string | null {
  const direct =
    html.match(
      /var\s+exchangeRatesVars\s*=\s*\{[\s\S]*?["']nonce["']\s*:\s*["']([^"']+)["']/i
    ) ??
    html.match(
      /exchangeRatesVars\s*=\s*\{[\s\S]*?["']nonce["']\s*:\s*["']([^"']+)["']/i
    );

  if (direct?.[1]) {
    return direct[1];
  }

  const dataScriptRegex =
    /data:text\/javascript;base64,([A-Za-z0-9+/=]+)/gi;

  let match: RegExpExecArray | null;

  while (
    (match =
      dataScriptRegex.exec(html)) !== null
  ) {
    try {
      const decoded = Buffer.from(
        match[1],
        "base64"
      ).toString("utf8");

      if (
        !decoded.includes(
          "exchangeRatesVars"
        )
      ) {
        continue;
      }

      const nonceMatch =
        decoded.match(
          /var\s+exchangeRatesVars\s*=\s*\{[\s\S]*?["']nonce["']\s*:\s*["']([^"']+)["']/i
        ) ??
        decoded.match(
          /exchangeRatesVars\s*=\s*\{[\s\S]*?["']nonce["']\s*:\s*["']([^"']+)["']/i
        );

      if (nonceMatch?.[1]) {
        return nonceMatch[1];
      }
    } catch {
      // Ignore unrelated/invalid data scripts.
    }
  }

  return null;
}

async function fetchPage(): Promise<string> {
  const response = await fetch(PAGE_URL, {
    cache: "no-store",
    headers: {
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language":
        "en-US,en;q=0.9",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36"
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
  const today =
    new Intl.DateTimeFormat("en-CA", {
      timeZone:
        "Africa/Addis_Ababa",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(new Date());

  const body =
    new URLSearchParams({
      action:
        "get_exchange_rates",
      nonce,
      shortcode_type:
        "rates_widgest",
      is_user_selected:
        "false",
      _timestamp:
        Date.now().toString(),
      date: today,
      selected_currencies:
        "USD, GBP, EUR, AED, SAR, CNY,JPY,CHF",
      title: "EXCHANGE Rate",
      more_link: "#"
    });

  const response = await fetch(
    AJAX_URL,
    {
      method: "POST",
      cache: "no-store",
      headers: {
        Accept:
          "application/json, text/javascript, */*; q=0.01",
        "Content-Type":
          "application/x-www-form-urlencoded; charset=UTF-8",
        "User-Agent":
          "Mozilla/5.0 (compatible; EthioFX/1.0; exchange-rate-monitor)",
        Referer: PAGE_URL,
        "X-Requested-With":
          "XMLHttpRequest"
      },
      body
    }
  );

  if (!response.ok) {
    throw new Error(
      `Awash Bank API returned HTTP ${response.status}`
    );
  }

  const json =
    (await response.json()) as AwashResponse;

  if (!json.success) {
    throw new Error(
      "Awash Bank API rejected the nonce."
    );
  }

  return json;
}

export class AwashProvider
  implements RateProvider
{
  readonly name = "Awash Bank";
  readonly slug = "awash";
  readonly sourceUrl = PAGE_URL;

  async fetchRates(): Promise<
    FxRate[]
  > {
    const html =
      await fetchPage();

    const extractedNonce =
      extractNonce(html);

    const storedNonce =
      await getProviderNonce(
        "awash"
      );

    let nonce =
      extractedNonce ??
      storedNonce ??
      process.env.AWASH_NONCE ??
      null;

    console.log(
      "[awash-debug]",
      {
        foundNonce:
          Boolean(extractedNonce),
        usingStoredNonce:
          !extractedNonce &&
          Boolean(storedNonce),
        usingEnvNonce:
          !extractedNonce &&
          !storedNonce &&
          Boolean(
            process.env
              .AWASH_NONCE
          )
      }
    );

    if (
      extractedNonce &&
      extractedNonce !==
        storedNonce
    ) {
      await saveProviderNonce(
        "awash",
        extractedNonce
      );
    }

    /*
      If no nonce is available at all,
      fetch one automatically with Browserless.
    */
    if (!nonce) {
      console.warn(
        "[awash] no nonce available; fetching fresh nonce"
      );

      nonce =
        await fetchFreshAwashNonce();

      await saveProviderNonce(
        "awash",
        nonce
      );
    }

    let json: AwashResponse;

    try {
      /*
        First attempt:
        extracted / Supabase / env nonce.
      */
      json =
        await fetchAwashRates(
          nonce
        );
    } catch (error) {
      /*
        Stored nonce probably expired.
        Browserless gets a fresh one,
        Supabase is updated,
        then Awash is retried once.
      */
      console.warn(
        "[awash] nonce failed; refreshing automatically",
        error
      );

      const freshNonce =
        await fetchFreshAwashNonce();

      await saveProviderNonce(
        "awash",
        freshNonce
      );

      nonce = freshNonce;

      console.log(
        "[awash] fresh nonce saved to Supabase"
      );

      json =
        await fetchAwashRates(
          nonce
        );
    }

    const usd =
      json.data?.rates?.USD;

    if (!usd) {
      throw new Error(
        "Awash Bank API returned no USD exchange rate."
      );
    }

    const cashBuy =
      parseRate(usd.buying);

    const cashSell =
      parseRate(usd.selling);

    const transactionBuy =
      parseRate(
        usd.transaction_buying
      );

    const transactionSell =
      parseRate(
        usd.transaction_selling
      );

    const fetchedAt =
      new Date().toISOString();

    const date =
      json.data?.date;

    const effectiveAt = date
      ? new Date(
          `${date}T00:00:00+03:00`
        ).toISOString()
      : fetchedAt;

    const output: FxRate[] =
      [];

    if (
      validPair(
        cashBuy,
        cashSell
      )
    ) {
      output.push({
        bank: this.name,
        slug: this.slug,
        currency: "USD",
        buy: cashBuy,
        sell: cashSell!,
        rateType: "cash",
        sourceUrl:
          this.sourceUrl,
        effectiveAt,
        fetchedAt
      });
    }

    if (
      validPair(
        transactionBuy,
        transactionSell
      )
    ) {
      output.push({
        bank: this.name,
        slug: this.slug,
        currency: "USD",
        buy: transactionBuy,
        sell:
          transactionSell!,
        rateType:
          "transaction",
        sourceUrl:
          this.sourceUrl,
        effectiveAt,
        fetchedAt
      });
    }

    if (
      output.length === 0
    ) {
      throw new Error(
        "Awash Bank returned no valid USD rates."
      );
    }

    console.log(
      "[awash-output]",
      output.map((rate) => ({
        rateType:
          rate.rateType,
        buy: rate.buy,
        sell: rate.sell
      }))
    );

    return output;
  }
}

export const awashProvider =
  new AwashProvider();