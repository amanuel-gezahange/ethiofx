import { NextRequest, NextResponse } from "next/server";

import { getLatestRates } from "@/lib/db/rates";
import { getRates as getDemoRates } from "@/lib/rates";
import { hasSupabaseConfig } from "@/lib/env";
import { FOREX_BUREAU_SLUGS } from "@/lib/forex-bureaus";

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

  try {
    // Forex bureaus are cash only
    const type = "cash";

    // Demo mode
    if (!hasSupabaseConfig()) {
      const demoRates = getDemoRates(currency).filter(
        (rate) => rate.rateType === "cash" && FOREX_BUREAU_SLUGS.has(rate.slug)
      );

      return NextResponse.json({
        currency,
        base: "ETB",
        rateType: "cash",
        category: "forex",
        demo: true,
        rates: demoRates,
        count: demoRates.length,
        fetchedAt: new Date().toISOString()
      });
    }

    const dbRates = (await getLatestRates(currency, type)) as DbRate[];

    const now = Date.now();

    const rates = dbRates
      // Keep independent forex bureaus only
      .filter((rate) => FOREX_BUREAU_SLUGS.has(rate.slug))
      .map((rate) => {
        const fetchedTime = new Date(rate.fetched_at).getTime();

        const ageHours = Number.isFinite(fetchedTime)
          ? (now - fetchedTime) / (1000 * 60 * 60)
          : null;

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

    const currentRates = rates.filter((rate) => rate.freshness === "current");

    const buyRanking = [...currentRates].sort((a, b) => b.buy - a.buy);

    const sellRanking = [...currentRates].sort((a, b) => a.sell - b.sell);

    return NextResponse.json({
      currency,
      base: "ETB",
      rateType: "cash",
      category: "forex",
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

    console.error("[api:rates:forex]", error);

    return NextResponse.json(
      {
        error: "Could not load forex bureau rates",
        detail: message
      },
      { status: 500 }
    );
  }
}
