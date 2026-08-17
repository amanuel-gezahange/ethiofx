import { NextRequest, NextResponse } from "next/server";
import { getLatestRates } from "@/lib/db/rates";
import { getRates as getDemoRates } from "@/lib/rates";
import { hasSupabaseConfig } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const currency = (req.nextUrl.searchParams.get("currency") || "USD").toUpperCase();
  const type =
    req.nextUrl.searchParams.get("type") === "cash" ? "cash" : "transaction";

  try {
    if (!hasSupabaseConfig()) {
      return NextResponse.json({
        currency,
        base: "ETB",
        rateType: type,
        demo: true,
        rates: getDemoRates(currency).filter((r) => r.rateType === type),
        fetchedAt: new Date().toISOString()
      });
    }

    const rates = await getLatestRates(currency, type);

    return NextResponse.json({
      currency,
      base: "ETB",
      rateType: type,
      demo: false,
      rates,
      fetchedAt: new Date().toISOString()
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    return NextResponse.json(
      { error: "Could not load rates", detail: message },
      { status: 500 }
    );
  }
}
