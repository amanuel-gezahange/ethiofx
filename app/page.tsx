"use client";

import { useEffect, useMemo, useState } from "react";
import type { FxIntent } from "@/lib/types";

type ApiRate = {
  bank: string;
  slug: string;
  currency: string;
  buy: number;
  sell: number;
  rateType: "cash" | "transaction";
  sourceUrl: string;
  effectiveAt: string | null;
  fetchedAt: string;
  freshness: "current" | "cached";
  ageHours: number | null;
};

type RatesResponse = {
  currency: string;
  base: string;
  rateType: "cash" | "transaction";
  demo: boolean;
  bestBuy: ApiRate | null;
  bestSell: ApiRate | null;
  rates: ApiRate[];
  count: number;
  currentCount: number;
  cachedCount: number;
  fetchedAt: string;
};

const money = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
});

const rateNumber = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

function relativeTime(iso: string | null | undefined) {
  if (!iso) return "unknown";

  const ts = new Date(iso).getTime();

  if (!Number.isFinite(ts)) {
    return "unknown";
  }

  const diffMs = Math.max(0, Date.now() - ts);
  const minutes = Math.floor(diffMs / 60000);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours}h ago`;
  }

  return `${Math.floor(hours / 24)}d ago`;
}

export default function Home() {
  const [intent, setIntent] =
    useState<FxIntent>("sell-foreign");

  const [amount, setAmount] = useState(10000);
  const [query, setQuery] = useState("");

  const [rates, setRates] = useState<ApiRate[]>([]);

  const [rateType, setRateType] =
    useState<"cash" | "transaction">("transaction");

  const [loading, setLoading] = useState(true);
  const [error, setError] =
    useState<string | null>(null);

  const [currentCount, setCurrentCount] = useState(0);
  const [cachedCount, setCachedCount] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    async function loadRates() {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(
          `/api/rates?currency=USD&type=${rateType}`,
          {
            cache: "no-store",
            signal: controller.signal,
          }
        );

        if (!response.ok) {
          throw new Error(
            `Rates API returned HTTP ${response.status}`
          );
        }

        const payload =
          (await response.json()) as RatesResponse;

        setRates(payload.rates);
        setCurrentCount(payload.currentCount ?? 0);
        setCachedCount(payload.cachedCount ?? 0);
      } catch (err) {
        if (controller.signal.aborted) return;

        setError(
          err instanceof Error
            ? err.message
            : "Could not load rates."
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    loadRates();

    return () => controller.abort();
  }, [rateType]);

  const visible = useMemo(() => {
    const search = query.trim().toLowerCase();

    const filtered = rates.filter((rate) =>
      rate.bank.toLowerCase().includes(search)
    );

    return [...filtered].sort((a, b) => {
      if (
        a.freshness === "current" &&
        b.freshness === "cached"
      ) {
        return -1;
      }

      if (
        a.freshness === "cached" &&
        b.freshness === "current"
      ) {
        return 1;
      }

      return intent === "sell-foreign"
        ? b.buy - a.buy
        : a.sell - b.sell;
    });
  }, [intent, query, rates]);

  const currentVisible = visible.filter(
    (rate) => rate.freshness === "current"
  );

  const best = currentVisible[0];

  const bestTotal = best
    ? amount *
    (intent === "sell-foreign"
      ? best.buy
      : best.sell)
    : 0;

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand">
          <div className="logo">E</div>

          <div>
            <strong>EthioFX</strong>
            <span>
              Ethiopian bank FX comparison
            </span>
          </div>
        </div>

        <div className="live">
          <span />

          {loading
            ? "Loading..."
            : `${currentCount} current · ${cachedCount} cached`}
        </div>
      </header>

      <section className="hero">
        <div>
          <p className="eyebrow">USD / ETB</p>

          <h1>
            Compare banks.
            <br />
            Keep more of your money.
          </h1>

          <p className="sub">
            See which Ethiopian bank gives you the best
            USD rate right now.
          </p>
        </div>
      </section>

      <section className="searchPanel card">
        <div className="modeRow">
          <div className="segmented">
            <button
              className={
                intent === "sell-foreign"
                  ? "active"
                  : ""
              }
              onClick={() =>
                setIntent("sell-foreign")
              }
            >
              Selling USD
            </button>

            <button
              className={
                intent === "buy-foreign"
                  ? "active"
                  : ""
              }
              onClick={() =>
                setIntent("buy-foreign")
              }
            >
              Buying USD
            </button>
          </div>

          <div className="segmented compact">
            <button
              className={
                rateType === "transaction"
                  ? "active"
                  : ""
              }
              onClick={() =>
                setRateType("transaction")
              }
            >
              Transaction
            </button>

            <button
              className={
                rateType === "cash"
                  ? "active"
                  : ""
              }
              onClick={() =>
                setRateType("cash")
              }
            >
              Cash
            </button>
          </div>
        </div>

        <div className="amountSearchRow">
          <label className="amountField">
            <span>Amount</span>

            <div className="amountWrap">
              <b>$</b>

              <input
                type="number"
                min={0}
                value={amount}
                onChange={(e) =>
                  setAmount(
                    Math.max(
                      0,
                      Number(e.target.value)
                    )
                  )
                }
              />

              <strong>USD</strong>
            </div>
          </label>

          <label className="bankSearchField">
            <span>Search bank</span>

            <input
              className="search"
              placeholder="Search by bank name"
              value={query}
              onChange={(e) =>
                setQuery(e.target.value)
              }
            />
          </label>
        </div>
      </section>

      {error && (
        <section className="card statusCard errorCard">
          <strong>
            Couldn&apos;t load live rates.
          </strong>

          <span>{error}</span>
        </section>
      )}

      {best && (
        <section className="spotlight card">
          <div className="spotlightBadge">
            Best current rate
          </div>

          <div className="spotlightMain">
            <div>
              <span className="rankPill">#1</span>

              <h2>{best.bank}</h2>

              <p className="freshness">
                Current · verified{" "}
                {relativeTime(best.fetchedAt)}
              </p>
            </div>

            <div className="spotlightRate">
              <span>
                {intent === "sell-foreign"
                  ? "Bank buys USD at"
                  : "Bank sells USD at"}
              </span>

              <strong>
                {rateNumber.format(
                  intent === "sell-foreign"
                    ? best.buy
                    : best.sell
                )}
              </strong>

              <small>ETB / USD</small>
            </div>

            <div className="spotlightValue">
              <span>
                {intent === "sell-foreign"
                  ? "You receive"
                  : "You pay"}
              </span>

              <strong>
                {money.format(bestTotal)} ETB
              </strong>
            </div>
          </div>
        </section>
      )}

      <section className="resultsSection">
        <div className="sectionHeading">
          <div>
            <p className="eyebrow">
              All banks
            </p>

            <h2>
              {intent === "sell-foreign"
                ? "Highest buying rates"
                : "Lowest selling rates"}
            </h2>
          </div>

          <span className="resultCount">
            {visible.length} banks
          </span>
        </div>

        {loading && (
          <div className="card statusCard">
            Loading rates...
          </div>
        )}

        {!loading && (
          <div className="bankGrid">
            {visible.map((rate, index) => {
              const transactionValue =
                amount *
                (intent === "sell-foreign"
                  ? rate.buy
                  : rate.sell);

              const ranking =
                rate.freshness === "current"
                  ? currentVisible.findIndex(
                    (item) =>
                      item.slug === rate.slug
                  ) + 1
                  : null;

              const isWinner = ranking === 1;

              return (
                <article
                  key={`${rate.slug}-${rate.rateType}`}
                  className={`bankCard ${isWinner ? "winner" : ""
                    } ${rate.freshness === "cached"
                      ? "cached"
                      : ""
                    }`}
                >
                  <div className="bankCardTop">
                    <div className="rankArea">
                      {ranking ? (
                        <span className="rankPill">
                          #{ranking}
                        </span>
                      ) : (
                        <span className="cachedPill">
                          Cached
                        </span>
                      )}

                      {isWinner && (
                        <span className="bestPill">
                          Best rate
                        </span>
                      )}
                    </div>

                    <a
                      href={rate.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="sourceLink"
                    >
                      Source ↗
                    </a>
                  </div>

                  <div className="bankIdentity">
                    <div className="bankAvatar">
                      {rate.bank
                        .charAt(0)
                        .toUpperCase()}
                    </div>

                    <div>
                      <h3>{rate.bank}</h3>

                      <p>
                        {rate.freshness === "current"
                          ? "Current"
                          : "Cached"}{" "}
                        ·{" "}
                        {relativeTime(
                          rate.fetchedAt
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="ratePair">
                    <div>
                      <span>Buy</span>
                      <strong>
                        {rateNumber.format(
                          rate.buy
                        )}
                      </strong>
                    </div>

                    <div>
                      <span>Sell</span>
                      <strong>
                        {rateNumber.format(
                          rate.sell
                        )}
                      </strong>
                    </div>
                  </div>

                  <div className="valueBlock">
                    <span>
                      {intent === "sell-foreign"
                        ? "You receive"
                        : "You pay"}
                    </span>

                    <strong>
                      {money.format(
                        transactionValue
                      )}{" "}
                      ETB
                    </strong>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <footer>
        <p>
          Rates are sourced from official bank data.
          Cached rates remain visible but are excluded
          from best-rate rankings.
        </p>
      </footer>
    </main>
  );
}