import type { FxRate } from "@/lib/types";
import type { RateProvider } from "./provider";

const SOURCE_URL = "https://www.dugdaforex.com/rates";

function extractUsdRate(html: string) {
  const match = html.match(
    /\{\\"code\\":\\"USD\\",\\"name\\":\\"[^"]*\\",\\"buyRate\\":([0-9.]+),\\"sellRate\\":([0-9.]+)/
  );

  if (!match) {
    throw new Error("Could not find Dugda Forex USD rate");
  }

  const buy = Number(match[1]);
  const sell = Number(match[2]);

  if (!Number.isFinite(buy) || !Number.isFinite(sell)) {
    throw new Error(
      `Could not parse Dugda USD rates: buy=${match[1]}, sell=${match[2]}`
    );
  }

  return { buy, sell };
}

function extractEffectiveAt(html: string): string | null {
  const match = html.match(/\\"effectiveDate\\":\\"([^"]+)\\"/);

  if (!match) {
    return null;
  }

  const date = new Date(match[1]);

  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

export const fourXProvider: RateProvider = {
  name: "FOUR X Forex Bureau",
  slug: "four-x",
  sourceUrl: SOURCE_URL,

  async fetchRates(): Promise<FxRate[]> {
    const response = await fetch(SOURCE_URL, {
      cache: "no-store",
      headers: {
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "User-Agent":
          "Mozilla/5.0 (compatible; EthioFX/1.0; +https://ethiofx.com)"
      }
    });

    if (!response.ok) {
      throw new Error(`FOUR X Forex returned HTTP ${response.status}`);
    }

    const html = await response.text();

    const { buy, sell } = extractUsdRate(html);

    if (
      buy <= 0 ||
      sell <= 0 ||
      sell < buy ||
      buy < 100 ||
      buy > 300 ||
      sell < 100 ||
      sell > 300
    ) {
      throw new Error(`FOUR X USD rates look invalid: buy=${buy}, sell=${sell}`);
    }

    return [
      {
        bank: "FOUR X Forex Bureau",
        slug: "dugda",
        currency: "USD",
        buy,
        sell,
        rateType: "cash",
        sourceUrl: SOURCE_URL,
        effectiveAt: extractEffectiveAt(html),
        fetchedAt: new Date().toISOString()
      }
    ];
  }
};
