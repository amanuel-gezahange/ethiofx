import { coopProvider } from "@/providers/coop";
import { NextRequest, NextResponse } from "next/server";

import { cbeProvider } from "@/providers/cbe";
import { wegagenProvider } from "@/providers/wegagen";

import { saveProviderRates } from "@/lib/db/rates";
import { env, hasSupabaseConfig } from "@/lib/env";
import type { RateProvider } from "@/providers/provider";
import { abyssiniaProvider } from "@/providers/abyssinia";
import { dashenProvider } from "@/providers/dashen";
import { HibretProvider } from "@/providers/hibret";
import { nibProvider } from "@/providers/nib";
import { awashProvider } from "@/providers/awash";
import { zemenProvider } from "@/providers/zemen";
import { abayProvider } from "@/providers/abay";
import { bunnaProvider } from "@/providers/bunna";
import { tsehayProvider } from "@/providers/tsehay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthorized(req: NextRequest) {
  if (
    process.env.NODE_ENV === "development" &&
    !env.INGEST_SECRET &&
    !env.CRON_SECRET
  ) {
    return true;
  }

  const auth = req.headers.get("authorization");

  const ingestAuthorized =
    Boolean(env.INGEST_SECRET) && auth === `Bearer ${env.INGEST_SECRET}`;

  const cronAuthorized =
    Boolean(env.CRON_SECRET) && auth === `Bearer ${env.CRON_SECRET}`;

  return ingestAuthorized || cronAuthorized;
}

const hibretProvider = new HibretProvider();

const providers: RateProvider[] = [cbeProvider, abayProvider, coopProvider, wegagenProvider, abyssiniaProvider, dashenProvider, hibretProvider, nibProvider, awashProvider, zemenProvider, bunnaProvider, tsehayProvider];

async function ingest(req: NextRequest) {
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

export async function POST(req: NextRequest) {
  return ingest(req);
}

export async function GET(req: NextRequest) {
  return ingest(req);
}
