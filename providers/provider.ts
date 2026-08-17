import type { FxRate } from "@/lib/types";

export interface RateProvider {
  readonly name: string;
  readonly slug: string;
  readonly sourceUrl: string;

  fetchRates(): Promise<FxRate[]>;
}
