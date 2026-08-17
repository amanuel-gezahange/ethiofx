import { NextRequest, NextResponse } from "next/server";

import { cbeProvider } from "@/providers/cbe";
import { wegagenProvider } from "@/providers/wegagen";

import { saveProviderRates } from "@/lib/db/rates";
import { env, hasSupabaseConfig } from "@/lib/env";
import type { RateProvider } from "@/providers/provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthorized(req: NextRequest) {
  if (process.env.NODE_ENV === "development" && !env.INGEST_SECRET) {
    return true;
  }

  const auth = req.headers.get("authorization");

  return Boolean(env.INGEST_SECRET && auth === `Bearer ${env.INGEST_SECRET}`);
}

const providers: RateProvider[] = [cbeProvider, wegagenProvider];

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!hasSupabaseConfig()) {
    return NextResponse.json(
      {
        error: "Supabase is not configured"
      },
      { status: 500 }
    );
  }

  const startedAt = new Date().toISOString();

  const results = await Promise.allSettled(
    providers.map(async (provider) => {
      const rates = await provider.fetchRates();

      const result = await saveProviderRates(rates);

      return {
        provider: provider.slug,
        inserted: result.inserted,
        currencies: [...new Set(rates.map((rate) => rate.currency))]
      };
    })
  );

  const summary = results.map((result, index) => {
    const provider = providers[index];

    if (result.status === "fulfilled") {
      return {
        success: true,
        ...result.value
      };
    }

    const message =
      result.reason instanceof Error
        ? result.reason.message
        : "Unknown ingestion error";

    console.error(`[ingest:${provider.slug}]`, result.reason);

    return {
      provider: provider.slug,
      success: false,
      error: message
    };
  });

  const successful = summary.filter((item) => item.success);

  const failed = summary.filter((item) => !item.success);

  return NextResponse.json(
    {
      startedAt,
      finishedAt: new Date().toISOString(),

      success: failed.length === 0,

      providers: {
        total: providers.length,
        successful: successful.length,
        failed: failed.length
      },

      results: summary
    },
    {
      status: successful.length === 0 ? 502 : 200
    }
  );
}
