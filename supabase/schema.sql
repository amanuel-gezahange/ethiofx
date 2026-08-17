create extension if not exists pgcrypto;

create table if not exists public.banks (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  website text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.fx_rates (
  id bigserial primary key,
  bank_id uuid not null references public.banks(id) on delete cascade,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  rate_type text not null check (rate_type in ('cash', 'transaction')),
  buy numeric(18,6) not null check (buy > 0),
  sell numeric(18,6) not null check (sell > 0),
  source_url text not null,
  effective_at timestamptz,
  fetched_at timestamptz not null default now(),
  constraint sensible_spread check (sell > buy)
);

create index if not exists fx_rates_lookup_idx
  on public.fx_rates (currency, rate_type, bank_id, fetched_at desc);

create or replace function public.latest_fx_rates(
  p_currency text default 'USD',
  p_rate_type text default 'transaction'
)
returns table (
  bank text,
  slug text,
  currency text,
  buy numeric,
  sell numeric,
  rate_type text,
  source_url text,
  effective_at timestamptz,
  fetched_at timestamptz
)
language sql
stable
security invoker
as $$
  select distinct on (r.bank_id)
    b.name as bank,
    b.slug,
    r.currency,
    r.buy,
    r.sell,
    r.rate_type,
    r.source_url,
    r.effective_at,
    r.fetched_at
  from public.fx_rates r
  join public.banks b on b.id = r.bank_id
  where
    b.active = true
    and r.currency = upper(p_currency)
    and r.rate_type = p_rate_type
  order by r.bank_id, r.fetched_at desc;
$$;

alter table public.banks enable row level security;
alter table public.fx_rates enable row level security;

-- The app's server uses the service-role key, which bypasses RLS.
-- Do NOT expose SUPABASE_SERVICE_ROLE_KEY to the browser.
