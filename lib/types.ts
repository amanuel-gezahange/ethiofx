export type RateType = "cash" | "transaction";

export type FxRate = {
  bank: string;
  slug: string;
  currency: string;
  buy: number;
  sell: number;
  rateType: RateType;
  sourceUrl: string;
  effectiveAt?: string | null;
  fetchedAt: string;
};

export type FxIntent = "sell-foreign" | "buy-foreign";
