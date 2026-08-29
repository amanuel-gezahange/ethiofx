import { NextResponse } from "next/server";

import { fetchFreshAwashNonce } from "@/lib/awash-browser";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const nonce = await fetchFreshAwashNonce();

    return NextResponse.json({
      found: Boolean(nonce),
      nonce
    });
  } catch (error) {
    return NextResponse.json(
      {
        found: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown error"
      },
      { status: 500 }
    );
  }
}