import type { FxRate } from "@/lib/types";
import { getSupabaseAdmin } from "@/lib/supabase/server";

type BankRow = {
  id: string;
  slug: string;
};

type SavedRateRow = {
  bank_id: string;
  currency: string;
  rate_type: string;
  buy: number;
  sell: number;
  effective_at: string | null;
};

export async function saveProviderRates(rates: FxRate[]) {
  if (rates.length === 0) {
    return {
      inserted: 0,
      skipped: 0
    };
  }

  const supabase = getSupabaseAdmin();
  const bank = rates[0];

  const { data: bankRow, error: bankError } = await supabase
    .from("banks")
    .upsert(
      {
        name: bank.bank,
        slug: bank.slug,
        website: new URL(bank.sourceUrl).origin,
        active: true
      },
      { onConflict: "slug" }
    )
    .select("id, slug")
    .single<BankRow>();

  if (bankError || !bankRow) {
    throw new Error(
      `Could not upsert bank: ${bankError?.message ?? "unknown error"}`
    );
  }

  const rows = rates.map((rate) => ({
    bank_id: bankRow.id,
    currency: rate.currency,
    rate_type: rate.rateType,
    buy: rate.buy,
    sell: rate.sell,
    source_url: rate.sourceUrl,
    effective_at: rate.effectiveAt ?? null,
    fetched_at: rate.fetchedAt
  }));

  const { data, error } = await supabase
    .from("fx_rates")
    .upsert(rows, {
      onConflict: "bank_id,currency,rate_type,buy,sell,effective_at",
      ignoreDuplicates: true
    })
    .select("bank_id,currency,rate_type,buy,sell,effective_at")
    .returns<SavedRateRow[]>();

  if (error) {
    throw new Error(`Could not save FX rates: ${error.message}`);
  }

  const inserted = data?.length ?? 0;
  const skipped = rows.length - inserted;

  return {
    inserted,
    skipped
  };
}

export async function getLatestRates(
  currency = "USD",
  rateType: "transaction" | "cash" = "transaction"
) {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase.rpc("latest_fx_rates", {
    p_currency: currency,
    p_rate_type: rateType
  });

  if (error) {
    throw new Error(`Could not load latest FX rates: ${error.message}`);
  }

  return data ?? [];
}
