import { z } from "zod";

const serverSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  INGEST_SECRET: z.string().min(12).optional()
});

export const env = serverSchema.parse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  INGEST_SECRET: process.env.INGEST_SECRET
});

export function hasSupabaseConfig() {
  return Boolean(
    env.NEXT_PUBLIC_SUPABASE_URL &&
    env.SUPABASE_SERVICE_ROLE_KEY
  );
}
