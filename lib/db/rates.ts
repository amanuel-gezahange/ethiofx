import type { FxRate } from "@/lib/types";
import { getSupabaseAdmin } from "@/lib/supabase/server";

type BankRow = {
  id: string;
  slug: string;
};

export async function saveProviderRates(rates: FxRate[]) {
  if (rates.length === 0) return { inserted: 0 };

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
    throw new Error(`Could not upsert bank: ${bankError?.message ?? "unknown error"}`);
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

  const { error } = await supabase.from("fx_rates").insert(rows);

  if (error) {
    throw new Error(`Could not insert FX rates: ${error.message}`);
  }

  return { inserted: rows.length };
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
