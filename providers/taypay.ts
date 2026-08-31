import type { FxRate } from "@/lib/types";
import type { RateProvider } from "./provider";

const TAYPAY_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vT7rZVlNT4C3L7Big_5ZfnQOCB7dAmuY388AG0YJCDc3HB-xoVX8PtCbPJZngJHYbNeEFLSCMHGOvLN/pub?gid=0&single=true&output=csv";

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      values.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  values.push(current.trim());

  return values;
}

function parseNumber(value: string): number {
  const cleaned = value.replace(/[^0-9.-]/g, "");
  const parsed = Number(cleaned);

  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid Taypay rate value: ${value}`);
  }

  return parsed;
}

export const taypayProvider: RateProvider = {
  name: "Taypay Forex Bureau",
  slug: "taypay",
  sourceUrl: TAYPAY_CSV_URL,

  async fetchRates(): Promise<FxRate[]> {
    const url = `${TAYPAY_CSV_URL}&cachebuster=${Date.now()}`;

    const response = await fetch(url, {
      cache: "no-store",
      headers: {
        Accept: "text/csv,text/plain,*/*"
      }
    });

    if (!response.ok) {
      throw new Error(`Taypay Forex Bureau request failed: ${response.status}`);
    }

    const csv = await response.text();

    const lines = csv
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length < 2) {
      throw new Error("Taypay Forex Bureau returned an empty CSV");
    }

    const headers = parseCsvLine(lines[0]).map((header) =>
      header.trim().toLowerCase()
    );

    const codeIndex = headers.indexOf("code");
    const buyingIndex = headers.indexOf("buying");
    const sellingIndex = headers.indexOf("selling");

    if (codeIndex === -1 || buyingIndex === -1 || sellingIndex === -1) {
      throw new Error(`Unexpected Taypay CSV headers: ${headers.join(", ")}`);
    }

    const usdRow = lines
      .slice(1)
      .map(parseCsvLine)
      .find((row) => row[codeIndex]?.trim().toUpperCase() === "USD");

    if (!usdRow) {
      throw new Error("Could not find Taypay USD rate");
    }

    const buy = parseNumber(usdRow[buyingIndex]);

    const sell = parseNumber(usdRow[sellingIndex]);

    if (buy <= 0 || sell <= 0 || buy > 1000 || sell > 1000 || sell < buy) {
      throw new Error(
        `Taypay USD rates look invalid: buy=${buy}, sell=${sell}`
      );
    }

    const fetchedAt = new Date().toISOString();

    return [
      {
        bank: "Taypay Forex Bureau",
        slug: "taypay",
        currency: "USD",
        buy,
        sell,
        rateType: "cash",
        sourceUrl: TAYPAY_CSV_URL,
        effectiveAt: null,
        fetchedAt
      }
    ];
  }
};
