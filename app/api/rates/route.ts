import { NextRequest, NextResponse } from "next/server";

import { getLatestRates } from "@/lib/db/rates";
import { getRates as getDemoRates } from "@/lib/rates";
import { hasSupabaseConfig } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DbRate = {
  bank: string;
  slug: string;
  currency: string;
  buy: number;
  sell: number;
  rate_type: "cash" | "transaction";
  source_url: string;
  effective_at: string | null;
  fetched_at: string;
};

export async function GET(req: NextRequest) {
  const currency = (
    req.nextUrl.searchParams.get("currency") || "USD"
  ).toUpperCase();

  const type =
    req.nextUrl.searchParams.get("type") === "cash" ? "cash" : "transaction";

  try {
    // Use demo data only when Supabase is not configured.
    if (!hasSupabaseConfig()) {
      return NextResponse.json({
        currency,
        base: "ETB",
        rateType: type,
        demo: true,
        rates: getDemoRates(currency).filter((rate) => rate.rateType === type),
        count: getDemoRates(currency).filter((rate) => rate.rateType === type)
          .length,
        fetchedAt: new Date().toISOString()
      });
    }

    const dbRates = (await getLatestRates(currency, type)) as DbRate[];

    const now = Date.now();

    const rates = dbRates.map((rate) => {
      const fetchedTime = new Date(rate.fetched_at).getTime();

      const ageHours = Number.isFinite(fetchedTime)
        ? (now - fetchedTime) / (1000 * 60 * 60)
        : null;

      /*
       * A rate is considered current if our system
       * successfully fetched it within the last 24 hours.
       *
       * Older rates stay in the response as cached data,
       * but they cannot win Best Buy / Best Sell.
       */
      const freshness =
        ageHours !== null && ageHours <= 24 ? "current" : "cached";

      return {
        bank: rate.bank,
        slug: rate.slug,
        currency: rate.currency,

        buy: Number(rate.buy),
        sell: Number(rate.sell),

        rateType: rate.rate_type,

        sourceUrl: rate.source_url,

        effectiveAt: rate.effective_at,
        fetchedAt: rate.fetched_at,

        freshness,

        ageHours: ageHours !== null ? Math.round(ageHours * 10) / 10 : null
      };
    });

    /*
     * Only current rates participate in rankings.
     *
     * Higher BUY = better when customer sells USD to bank.
     * Lower SELL = better when customer buys USD from bank.
     */
    const currentRates = rates.filter((rate) => rate.freshness === "current");

    const buyRanking = [...currentRates].sort((a, b) => b.buy - a.buy);

    const sellRanking = [...currentRates].sort((a, b) => a.sell - b.sell);

    return NextResponse.json({
      currency,
      base: "ETB",
      rateType: type,
      demo: false,

      bestBuy: buyRanking[0] ?? null,
      bestSell: sellRanking[0] ?? null,

      rates,

      count: rates.length,
      currentCount: currentRates.length,
      cachedCount: rates.length - currentRates.length,

      fetchedAt: new Date().toISOString()
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    console.error("[api:rates]", error);

    return NextResponse.json(
      {
        error: "Could not load rates",
        detail: message
      },
      { status: 500 }
    );
  }
}
