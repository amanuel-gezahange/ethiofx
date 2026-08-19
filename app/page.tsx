"use client";

import { useEffect, useMemo, useState } from "react";
import type { FxIntent, FxRate } from "@/lib/types";

type ApiRate = {
  bank: string;
  slug: string;
  currency: string;
  buy: number;
  sell: number;
  rate_type: "cash" | "transaction";
  source_url: string;
  effective_at: string | null;
  fetched_at: string;
};

type RatesResponse = {
  currency: string;
  base: string;
  rateType: "cash" | "transaction";
  demo: boolean;
  rates: ApiRate[];
  fetchedAt: string;
};

const money = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
});

function normalizeRate(row: ApiRate): FxRate {
  return {
    bank: row.bank,
    slug: row.slug,
    currency: row.currency,
    buy: Number(row.buy),
    sell: Number(row.sell),
    rateType: row.rate_type,
    sourceUrl: row.source_url,
    effectiveAt: row.effective_at,
    fetchedAt: row.fetched_at,
  };
}

const STALE_AFTER_MS = 12 * 60 * 60 * 1000;

function isStale(iso: string) {
  const ts = new Date(iso).getTime();

  if (!Number.isFinite(ts)) {
    return true;
  }

  return Date.now() - ts >= STALE_AFTER_MS;
}

function relativeTime(iso: string) {
  const ts = new Date(iso).getTime();
  const diffMs = Math.max(0, Date.now() - ts);
  const minutes = Math.floor(diffMs / 60000);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  return `${Math.floor(hours / 24)}d ago`;
}

export default function Home() {
  const [intent, setIntent] = useState<FxIntent>("sell-foreign");
  const [amount, setAmount] = useState(10000);
  const [query, setQuery] = useState("");
  const [rates, setRates] = useState<FxRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadRates() {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(
          "/api/rates?currency=USD&type=transaction",
          { cache: "no-store", signal: controller.signal }
        );

        if (!response.ok) {
          throw new Error(`Rates API returned HTTP ${response.status}`);
        }

        const payload = (await response.json()) as RatesResponse;
        setRates(payload.rates.map(normalizeRate));
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Could not load rates.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    loadRates();
    return () => controller.abort();
  }, []);

  const visible = useMemo(() => {
    const filtered = rates.filter((r) =>
      r.bank.toLowerCase().includes(query.toLowerCase())
    );

    return [...filtered].sort((a, b) =>
      intent === "sell-foreign" ? b.buy - a.buy : a.sell - b.sell
    );
  }, [intent, query, rates]);

  const best = visible[0];
  const worst = visible[visible.length - 1];

  const bestTotal = best
    ? amount * (intent === "sell-foreign" ? best.buy : best.sell)
    : 0;

  const worstTotal = worst
    ? amount * (intent === "sell-foreign" ? worst.buy : worst.sell)
    : 0;

  const advantage =
    intent === "sell-foreign" ? bestTotal - worstTotal : worstTotal - bestTotal;

  const latestFetchedAt = rates
    .map((r) => new Date(r.fetchedAt).getTime())
    .filter(Number.isFinite)
    .sort((a, b) => b - a)[0];

  const hasStaleRates = rates.some((r) => isStale(r.fetchedAt));

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand">
          <div className="logo">E</div>
          <div>
            <strong>EthioFX</strong>
            <span>Ethiopian bank FX comparison</span>
          </div>
        </div>

        <div className="live">
          <span />
          {loading
            ? "Loading rates..."
            : latestFetchedAt
              ? `${hasStaleRates ? "Some rates stale" : "Live"} · ${relativeTime(
                new Date(latestFetchedAt).toISOString()
              )}`
              : "No rates"}
        </div>
      </header>

      <section className="hero">
        <p className="eyebrow">USD / ETB</p>
        <h1>Find the best bank for your FX transaction.</h1>
        <p className="sub">
          Compare live bank rates, calculate your transaction value, and see the
          difference instantly.
        </p>
      </section>

      <section className="controls card">
        <div className="segmented">
          <button
            className={intent === "sell-foreign" ? "active" : ""}
            onClick={() => setIntent("sell-foreign")}
          >
            I’m selling USD
          </button>
          <button
            className={intent === "buy-foreign" ? "active" : ""}
            onClick={() => setIntent("buy-foreign")}
          >
            I’m buying USD
          </button>
        </div>

        <label>
          Amount
          <div className="amountWrap">
            <span>$</span>
            <input
              type="number"
              min={0}
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
            />
            <b>USD</b>
          </div>
        </label>
      </section>

      {error && (
        <section className="card statusCard errorCard">
          <strong>Couldn’t load live rates.</strong>
          <span>{error}</span>
        </section>
      )}

      {!loading && !error && rates.length === 0 && (
        <section className="card statusCard">
          <strong>No live USD transaction rates are available yet.</strong>
          <span>Run the ingestion endpoint and refresh this page.</span>
        </section>
      )}

      {best && (
        <section className="best card">
          <div>
            <p className="eyebrow">Best rate</p>
            <h2>{best.bank}</h2>
            <p className="rate">
              {intent === "sell-foreign" ? best.buy : best.sell} ETB / USD
            </p>
            <p className="freshness">
              {isStale(best.fetchedAt) ? "Stale" : "Live"} · verified{" "}
              {relativeTime(best.fetchedAt)}
            </p>
          </div>

          <div className="bestNumbers">
            <span>{intent === "sell-foreign" ? "You receive" : "Estimated cost"}</span>
            <strong>{money.format(bestTotal)} ETB</strong>
            <small>
              {visible.length > 1 && advantage > 0
                ? `${money.format(advantage)} ETB better than the worst listed rate`
                : "Best available listed rate"}
            </small>
          </div>
        </section>
      )}

      <section className="tableCard card">
        <div className="tableHeader">
          <div>
            <p className="eyebrow">All banks</p>
            <h2>Compare live rates</h2>
          </div>

          <input
            className="search"
            placeholder="Search bank…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <div className="table">
          <div className="row head">
            <span>Bank</span>
            <span>Buy</span>
            <span>Sell</span>
            <span>{intent === "sell-foreign" ? "You receive" : "You pay"}</span>
          </div>

          {loading && (
            <div className="row">
              <span className="bank"><b>Loading live rates…</b><small>Please wait</small></span>
              <span>—</span><span>—</span><strong>—</strong>
            </div>
          )}

          {!loading &&
            visible.map((r, index) => {
              const transaction =
                amount * (intent === "sell-foreign" ? r.buy : r.sell);

              return (
                <div
                  className={`row ${index === 0 ? "winner" : ""}`}
                  key={`${r.slug}-${r.currency}-${r.rateType}`}
                >
                  <span className="bank">
                    <b>{r.bank}</b>
                    <span className="bankMeta">
                      <a href={r.sourceUrl} target="_blank" rel="noreferrer">source</a>
                      <small>
                        · {isStale(r.fetchedAt) ? "stale" : "live"} · verified{" "}
                        {relativeTime(r.fetchedAt)}
                      </small>
                    </span>
                  </span>
                  <span className={intent === "sell-foreign" ? "focus" : ""}>{r.buy}</span>
                  <span className={intent === "buy-foreign" ? "focus" : ""}>{r.sell}</span>
                  <strong>{money.format(transaction)} ETB</strong>
                </div>
              );
            })}
        </div>
      </section>

      <footer>
        <p>Rates are sourced from official bank data and shown with their latest verification time.</p>
      </footer>
    </main>
  );
}
