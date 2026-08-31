"use client";

import { useEffect, useMemo, useState } from "react";
import type { FxIntent } from "@/lib/types";

type ProviderCategory = "banks" | "forex";

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
  category?: "banks" | "forex";
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

  const [category, setCategory] =
    useState<ProviderCategory>("banks");

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

        const endpoint =
          category === "forex"
            ? "/api/rates/forex?currency=USD"
            : `/api/rates/banks?currency=USD&type=${rateType}`;

        const response = await fetch(endpoint, {
          cache: "no-store",
          signal: controller.signal,
        });

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

        setRates([]);
        setCurrentCount(0);
        setCachedCount(0);
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    loadRates();

    return () => controller.abort();
  }, [category, rateType]);

  function selectCategory(nextCategory: ProviderCategory) {
    setCategory(nextCategory);
    setQuery("");

    // Independent forex bureaus are cash-rate providers.
    if (nextCategory === "forex") {
      setRateType("cash");
    }
  }

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

  const isForex = category === "forex";

  const providerLabel = isForex
    ? "forex bureaus"
    : "banks";

  const providerLabelSingular = isForex
    ? "forex bureau"
    : "bank";

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand">
          <div className="logo">E</div>

          <div>
            <strong>EthioFX</strong>
            <span>
              Ethiopian FX comparison
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
            Compare exchange rates.
            <br />
            Keep more of your money.
          </h1>

          <p className="sub">
            Compare Ethiopian banks and independent forex
            bureaus to find the best USD rate right now.
          </p>
        </div>
      </section>

      <section className="categorySection">
        <div className="marketSwitch">
          <button
            type="button"
            className={`marketCard ${category === "banks" ? "activeMarket" : ""
              }`}
            onClick={() => selectCategory("banks")}
            aria-pressed={category === "banks"}
          >
            <div className="marketCardTop">
              <div className="marketTicker">
                <span className="marketDot" />
                <span>BANK MARKET</span>
              </div>
              <span className="marketArrow">↗</span>
            </div>

            <div className="marketCardBody">
              <div>
                <span className="marketCode">ETB · BANKS</span>
                <strong>Bank FX Desk</strong>
                <small>
                  Cash and transaction quotes from Ethiopian banks
                </small>
              </div>
            </div>

            <div className="marketCardBottom">
              <span>Market coverage</span>
              <b>
                {category === "banks" && !loading
                  ? `${currentCount} LIVE`
                  : "OPEN BOARD"}
              </b>
            </div>
          </button>

          <button
            type="button"
            className={`marketCard ${category === "forex" ? "activeMarket" : ""
              }`}
            onClick={() => selectCategory("forex")}
            aria-pressed={category === "forex"}
          >
            <div className="marketCardTop">
              <div className="marketTicker">
                <span className="marketDot" />
                <span>FOREX BUREAU MARKET</span>
              </div>
              <span className="marketArrow">↗</span>
            </div>

            <div className="marketCardBody">
              <div>
                <span className="marketCode">USD / ETB · OTC</span>
                <strong>Independent FX Desk</strong>
                <small>
                  Cash quotes from licensed non-bank forex bureaus
                </small>
              </div>
            </div>

            <div className="marketCardBottom">
              <span>Market coverage</span>
              <b>
                {category === "forex" && !loading
                  ? `${currentCount} LIVE`
                  : "OPEN BOARD"}
              </b>
            </div>
          </button>
        </div>
      </section>

      <section className="terminalPanel">
        <div className="terminalToolbar">
          <div className="toolbarGroup">
            <div className="segmented terminalSegmented">
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

            {!isForex ? (
              <div className="segmented compact terminalSegmented">
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
            ) : (
              <div className="terminalBadge">CASH MARKET</div>
            )}
          </div>

          <div className="toolbarInputs">
            <label className="terminalField amountTerminal">
              <span>AMOUNT</span>
              <div>
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

            <label className="terminalField searchTerminal">
              <span>SEARCH</span>
              <input
                placeholder={
                  isForex
                    ? "Search forex bureau"
                    : "Search bank"
                }
                value={query}
                onChange={(e) =>
                  setQuery(e.target.value)
                }
              />
            </label>
          </div>
        </div>

        {error && (
          <div className="terminalAlert">
            <strong>Live feed unavailable</strong>
            <span>{error}</span>
          </div>
        )}

        <div className="metricGrid">
          <div className="metricCard accent">
            <span>BEST BUY</span>
            <strong>
              {currentVisible.length
                ? rateNumber.format(
                  Math.max(...currentVisible.map((r) => r.buy))
                )
                : "—"}
            </strong>
            <small>
              {currentVisible
                .slice()
                .sort((a, b) => b.buy - a.buy)[0]?.bank ?? "No live quote"}
            </small>
          </div>

          <div className="metricCard">
            <span>BEST SELL</span>
            <strong>
              {currentVisible.length
                ? rateNumber.format(
                  Math.min(...currentVisible.map((r) => r.sell))
                )
                : "—"}
            </strong>
            <small>
              {currentVisible
                .slice()
                .sort((a, b) => a.sell - b.sell)[0]?.bank ?? "No live quote"}
            </small>
          </div>

          <div className="metricCard">
            <span>AVG BUY</span>
            <strong>
              {currentVisible.length
                ? rateNumber.format(
                  currentVisible.reduce((sum, r) => sum + r.buy, 0) /
                  currentVisible.length
                )
                : "—"}
            </strong>
            <small>Market average</small>
          </div>

          <div className="metricCard">
            <span>MARKET STATUS</span>
            <strong>{loading ? "SYNC" : `${currentCount} LIVE`}</strong>
            <small>
              {cachedCount
                ? `${cachedCount} cached quote${cachedCount === 1 ? "" : "s"}`
                : "All displayed quotes current"}
            </small>
          </div>
        </div>

        {best && (
          <div className="bestStrip">
            <div className="bestStripLeft">
              <span className="bestStripLabel">TOP QUOTE</span>
              <strong>{best.bank}</strong>
              <small>
                Updated {relativeTime(best.fetchedAt)}
              </small>
            </div>

            <div className="bestStripRate">
              <span>
                {intent === "sell-foreign" ? "BUY" : "SELL"}
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

            <div className="bestStripValue">
              <span>
                {intent === "sell-foreign"
                  ? "YOU RECEIVE"
                  : "YOU PAY"}
              </span>
              <strong>{money.format(bestTotal)} ETB</strong>
            </div>
          </div>
        )}
      </section>

      <section className="resultsSection marketResults">
        <div className="sectionHeading businessHeading">
          <div>
            <p className="eyebrow">
              {isForex
                ? "INDEPENDENT FX MARKET"
                : "BANK FX MARKET"}
            </p>

            <h2>
              {intent === "sell-foreign"
                ? "Highest buying rates"
                : "Lowest selling rates"}
            </h2>
          </div>

          <div className="tableMeta">
            <span>{visible.length} providers</span>
            <span>USD / ETB</span>
            <span>{rateType.toUpperCase()}</span>
          </div>
        </div>

        {loading && (
          <div className="terminalLoading">
            Syncing market quotes...
          </div>
        )}

        {!loading && (
          <>
            <div className="marketTableWrap">
              <table className="marketTable">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Institution</th>
                    <th>Buy</th>
                    <th>Sell</th>
                    <th>
                      {intent === "sell-foreign"
                        ? "You receive"
                        : "You pay"}
                    </th>
                    <th>Updated</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>

                <tbody>
                  {visible.map((rate) => {
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
                      <tr
                        key={`${rate.slug}-${rate.rateType}`}
                        className={[
                          isWinner ? "winnerRow" : "",
                          rate.freshness === "cached" ? "cachedRow" : ""
                        ]
                          .filter(Boolean)
                          .join(" ")}
                      >
                        <td className="rankCell">
                          {ranking ? (
                            <span
                              className={`tableRank ${isWinner ? "topRank" : ""
                                }`}
                            >
                              {ranking}
                            </span>
                          ) : (
                            <span className="tableRank muted">—</span>
                          )}
                        </td>

                        <td>
                          <div className="institutionCell">
                            <div className="institutionAvatar">
                              {rate.bank.charAt(0).toUpperCase()}
                            </div>

                            <div>
                              <strong>{rate.bank}</strong>
                              <small>
                                {isForex
                                  ? "Forex bureau"
                                  : "Bank"}
                              </small>
                            </div>
                          </div>
                        </td>

                        <td className="numberCell">
                          {rateNumber.format(rate.buy)}
                        </td>

                        <td className="numberCell">
                          {rateNumber.format(rate.sell)}
                        </td>

                        <td className="valueCell">
                          {money.format(transactionValue)} ETB
                        </td>

                        <td className="mutedCell">
                          {relativeTime(rate.fetchedAt)}
                        </td>

                        <td>
                          <span
                            className={`statusPill ${rate.freshness === "current"
                                ? "liveStatus"
                                : "cachedStatus"
                              }`}
                          >
                            {rate.freshness === "current"
                              ? "LIVE"
                              : "CACHED"}
                          </span>
                        </td>

                        <td className="sourceCell">
                          <a
                            href={rate.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                            aria-label={`Open source for ${rate.bank}`}
                          >
                            ↗
                          </a>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {!error && visible.length === 0 && (
              <div className="terminalLoading">
                No providers match your search.
              </div>
            )}

            <div className="mobileRateList">
              {visible.map((rate) => {
                const transactionValue =
                  amount *
                  (intent === "sell-foreign"
                    ? rate.buy
                    : rate.sell);

                const ranking =
                  rate.freshness === "current"
                    ? currentVisible.findIndex(
                      (item) => item.slug === rate.slug
                    ) + 1
                    : null;

                return (
                  <article
                    className="mobileRateCard"
                    key={`mobile-${rate.slug}-${rate.rateType}`}
                  >
                    <div className="mobileRateHead">
                      <div>
                        <span className="tableRank">
                          {ranking ?? "—"}
                        </span>
                        <strong>{rate.bank}</strong>
                      </div>

                      <span
                        className={`statusPill ${rate.freshness === "current"
                            ? "liveStatus"
                            : "cachedStatus"
                          }`}
                      >
                        {rate.freshness === "current"
                          ? "LIVE"
                          : "CACHED"}
                      </span>
                    </div>

                    <div className="mobileNumbers">
                      <div>
                        <span>BUY</span>
                        <strong>{rateNumber.format(rate.buy)}</strong>
                      </div>
                      <div>
                        <span>SELL</span>
                        <strong>{rateNumber.format(rate.sell)}</strong>
                      </div>
                    </div>

                    <div className="mobileValue">
                      <span>
                        {intent === "sell-foreign"
                          ? "YOU RECEIVE"
                          : "YOU PAY"}
                      </span>
                      <strong>
                        {money.format(transactionValue)} ETB
                      </strong>
                    </div>

                    <div className="mobileMetaRow">
                      <span>
                        Updated {relativeTime(rate.fetchedAt)}
                      </span>

                      <a
                        href={rate.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Source ↗
                      </a>
                    </div>
                  </article>
                );
              })}
            </div>
          </>
        )}
      </section>

      <footer>
        <p>
          Rates are sourced from provider data. Cached rates
          remain visible but are excluded from best-rate
          rankings.
        </p>
      </footer>
    </main>
  );
}
