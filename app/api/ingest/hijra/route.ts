import { NextRequest, NextResponse } from "next/server";

import { hijraProvider } from "@/providers/hijra";
import { saveProviderRates } from "@/lib/db/rates";
import { env, hasSupabaseConfig } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthorized(req: NextRequest) {
  if (process.env.NODE_ENV === "development" && !env.INGEST_SECRET) {
    return true;
  }

  const auth = req.headers.get("authorization");

  return Boolean(
    env.INGEST_SECRET &&
      auth === `Bearer ${env.INGEST_SECRET}`
  );
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    const rates = await hijraProvider.fetchRates();

    if (!hasSupabaseConfig()) {
      return NextResponse.json({
        persisted: false,
        message:
          "Scrape succeeded, but Supabase is not configured. Returning parsed rates only.",
        rates
      });
    }

    const result = await saveProviderRates(rates);

    return NextResponse.json({
      persisted: true,
      provider: hijraProvider.slug,
      ...result,
      rates
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown ingestion error";

    console.error("[ingest:hijra]", error);

    return NextResponse.json(
      {
        error: "Hijra Bank ingestion failed",
        detail: message
      },
      { status: 502 }
    );
  }
}