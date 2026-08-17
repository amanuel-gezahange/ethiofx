# EthioFX MVP

Business-focused Ethiopian bank FX comparison.

## Current state

- working comparison UI
- demo fallback data
- Supabase/Postgres schema
- live CBE provider
- CBE ingestion endpoint
- latest-rate DB query
- validation + upstream-change failure handling

## 1. Install

```bash
npm install
```

## 2. Create Supabase tables

Create a Supabase project, open the SQL editor, and run:

```text
supabase/schema.sql
```

## 3. Configure environment

```bash
cp .env.example .env.local
```

Fill in:

```env
NEXT_PUBLIC_SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
INGEST_SECRET=...
```

Never expose the service-role key client-side.

## 4. Run

```bash
npm run dev
```

## 5. Test the CBE scraper without Supabase

If `INGEST_SECRET` is absent in local development:

```bash
curl -X POST http://localhost:3000/api/ingest/cbe
```

The endpoint returns the parsed official CBE rates. This is useful before DB setup.

## 6. Ingest CBE into Supabase

Once `.env.local` is configured:

```bash
curl -X POST \
  -H "Authorization: Bearer YOUR_INGEST_SECRET" \
  http://localhost:3000/api/ingest/cbe
```

Then:

```bash
curl "http://localhost:3000/api/rates?currency=USD&type=transaction"
```

## Data model

The DB stores every observation. It does not overwrite previous rates. The
`latest_fx_rates()` SQL function returns the newest observation for each bank.

## Production scheduling

Once deployed, call the protected ingestion endpoint from Vercel Cron, GitHub
Actions, or another scheduler.

Do not schedule aggressive scraping. Banks typically publish rates periodically,
not second-by-second. Start with a modest refresh cadence and respect upstream
availability.

## Next providers

Implement the same interface for:

- Awash
- Dashen
- Bank of Abyssinia
- Zemen

Do not add them until each parser is tested against the bank's current official
source.
