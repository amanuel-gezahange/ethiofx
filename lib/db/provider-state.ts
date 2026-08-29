import { getSupabaseAdmin } from "@/lib/supabase/server";

type ProviderStateRow = {
  provider: string;
  nonce: string | null;
  updated_at: string;
};

export async function getProviderNonce(
  provider: string
): Promise<string | null> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("provider_state")
    .select("provider, nonce, updated_at")
    .eq("provider", provider)
    .maybeSingle<ProviderStateRow>();

  if (error) {
    throw new Error(
      `Could not load provider state for ${provider}: ${error.message}`
    );
  }

  return data?.nonce ?? null;
}

export async function saveProviderNonce(
  provider: string,
  nonce: string
): Promise<void> {
  const supabase = getSupabaseAdmin();

  const { error } = await supabase
    .from("provider_state")
    .upsert(
      {
        provider,
        nonce,
        updated_at: new Date().toISOString()
      },
      {
        onConflict: "provider"
      }
    );

  if (error) {
    throw new Error(
      `Could not save provider state for ${provider}: ${error.message}`
    );
  }
}