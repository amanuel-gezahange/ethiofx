import { NextRequest, NextResponse } from "next/server";

import { coopProvider } from "@/providers/coop";
import { cbeProvider } from "@/providers/cbe";
import { wegagenProvider } from "@/providers/wegagen";
import { abyssiniaProvider } from "@/providers/abyssinia";
import { dashenProvider } from "@/providers/dashen";
import { HibretProvider } from "@/providers/hibret";
import { nibProvider } from "@/providers/nib";
import { awashProvider } from "@/providers/awash";
import { zemenProvider } from "@/providers/zemen";
import { abayProvider } from "@/providers/abay";
import { bunnaProvider } from "@/providers/bunna";
import { tsehayProvider } from "@/providers/tsehay";
import { amharaProvider } from "@/providers/amhara";
import { enatProvider } from "@/providers/enat";
import { berhanProvider } from "@/providers/berhan";
import { addisProvider } from "@/providers/addis";
import { globalProvider } from "@/providers/global";
import { oromiaProvider } from "@/providers/oromia";
import { gohProvider } from "@/providers/goh";

import { saveProviderRates } from "@/lib/db/rates";
import { env, hasSupabaseConfig } from "@/lib/env";
import type { RateProvider } from "@/providers/provider";
import { gadaaProvider } from "@/providers/gadaa";
import { hijraProvider } from "@/providers/hijra";
import { zamzamProvider } from "@/providers/zamzam";
import { siinqeeProvider } from "@/providers/siinqee";
import { tsedeyProvider } from "@/providers/tsedey";
import { sidamaProvider } from "@/providers/sidama";
import { shabelleProvider } from "@/providers/shabelle";
import { rammisProvider } from "@/providers/rammis";
import { siketProvider } from "@/providers/siket";
import { omoProvider } from "@/providers/omo";
import { dbeProvider } from "@/providers/dbe";
import { ahaduProvider } from "@/providers/ahadu";
import { lionProvider } from "@/providers/lion";
import { haronProvider } from "@/providers/haron";
import { globalForexProvider } from "@/providers/globalforex";
import { taypayProvider } from "@/providers/taypay";
import { yogaProvider } from "@/providers/yoga";
import { graceProvider } from "@/providers/grace";
import { waliaProvider } from "@/providers/walia";
import { fourXProvider } from "@/providers/four";
import { ammannProvider } from "@/providers/ammann";
import { roohaProvider } from "@/providers/rooha";
import { ayotanProvider } from "@/providers/ayotan";
import { dbhForexProvider } from "@/providers/dbhforex";
import { sabaProvider } from "@/providers/saba";

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

const providers: RateProvider[] = [
  cbeProvider,
  abayProvider,
  coopProvider,
  wegagenProvider,
  abyssiniaProvider,
  dashenProvider,
  hibretProvider,
  nibProvider,
  awashProvider,
  zemenProvider,
  bunnaProvider,
  tsehayProvider,
  amharaProvider,
  enatProvider,
  berhanProvider,
  addisProvider,
  globalProvider,
  oromiaProvider,
  gohProvider,
  gadaaProvider,
  hijraProvider,
  zamzamProvider,
  siinqeeProvider,
  tsedeyProvider,
  sidamaProvider,
  shabelleProvider,
  rammisProvider,
  siketProvider,
  omoProvider,
  dbeProvider,
  ahaduProvider,
  lionProvider,
  haronProvider,
  globalForexProvider,
  taypayProvider,
  yogaProvider,
  graceProvider,
  waliaProvider,
  fourXProvider,
  ammannProvider,
  roohaProvider,
  ayotanProvider,
  dbhForexProvider,
  sabaProvider
];

type IngestResult =
  | {
      success: true;
      provider: string;
      inserted: number;
      currencies: Awaited<ReturnType<RateProvider["fetchRates"]>>;
    }
  | {
      success: false;
      provider: string;
      error: string;
    };

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

  const results: IngestResult[] = [];

  for (const provider of providers) {
    try {
      const rates = await provider.fetchRates();

      const result = await saveProviderRates(rates);

      results.push({
        success: true,
        provider: provider.slug,
        inserted: result.inserted,
        currencies: rates
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown provider error";

      console.error(`[ingest:${provider.slug}]`, error);

      results.push({
        success: false,
        provider: provider.slug,
        error: message
      });
    }
  }

  const successful = results.filter((item) => item.success).length;

  const failed = results.length - successful;

  return NextResponse.json(
    {
      startedAt,
      finishedAt: new Date().toISOString(),

      success: failed === 0,

      providers: {
        total: providers.length,
        successful,
        failed
      },

      results
    },
    {
      status: successful === 0 ? 502 : 200
    }
  );
}

export async function POST(req: NextRequest) {
  return ingest(req);
}

export async function GET(req: NextRequest) {
  return ingest(req);
}