# Bank providers

Each bank gets its own adapter implementing `RateProvider`.

Rules:

1. Fetch only an official bank source.
2. Parse explicit rate categories; never guess which buy/sell pair is relevant.
3. Validate positive numeric values and suspicious spreads.
4. Preserve the official source URL.
5. Save `effectiveAt` when the bank publishes one and always save `fetchedAt`.
6. Fail loudly if the upstream HTML/API changes.
7. Never silently substitute yesterday's rate for today's.

## CBE

`providers/cbe.ts` currently parses:

- USD
- EUR
- GBP
- AED
- SAR

It records both `transaction` and `cash` rates when present.

The provider deliberately requires a USD transactional pair. If that pair cannot
be found, ingestion fails instead of persisting partial or potentially wrong data.
