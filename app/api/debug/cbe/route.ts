import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SOURCE_URL = "https://combanketh.et/exchange-rates?srcPage=home";

function isAuthorized(req: NextRequest) {
  if (process.env.NODE_ENV === "development" && !env.INGEST_SECRET) return true;

  return Boolean(
    env.INGEST_SECRET &&
      req.headers.get("authorization") === `Bearer ${env.INGEST_SECRET}`
  );
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const response = await fetch(SOURCE_URL, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; EthioFX/0.1; +https://localhost)",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9"
      },
      cache: "no-store"
    });

    const html = await response.text();
    const $ = cheerio.load(html);
    const body = $("body").text().replace(/\s+/g, " ").trim();

    return NextResponse.json({
      status: response.status,
      bytes: Buffer.byteLength(html, "utf8"),
      bodyHas: [
        "USD",
        "Transactional",
        "Buying",
        "Selling",
        "Cash",
        "No data available"
      ].filter((k) => body.toLowerCase().includes(k.toLowerCase())),
      scripts: $("script").length,
      nextDataPresent: $("#__NEXT_DATA__").length > 0,
      scriptSrcs: $("script[src]")
        .map((_, el) => $(el).attr("src"))
        .get()
        .filter(Boolean)
        .slice(0, 15)
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown debug error" },
      { status: 502 }
    );
  }
}

