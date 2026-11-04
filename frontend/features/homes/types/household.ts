export type HouseholdMember = {
  id: string;
  name: string;
  role: "owner" | "partner";
};

export type HomeCurrency = "JOD" | "USD" | "EUR" | "ILS" | "SAR" | "AED" | "EGP" | "GBP";

/** End-of-trip prompt: price each item, or enter one total for the trip. */
export type TripCostMode = "items" | "total";

export type CostSettings = {
  costsEnabled: boolean;
  currency: HomeCurrency | string;
  askCostOnSingleBuy: boolean;
  askCostOnBulkBuy: boolean;
  askCostOnTripEnd: boolean;
  tripCostMode: TripCostMode;
};

export type Household = {
  id: string;
  name: string;
  inviteCode: string;
  members: HouseholdMember[];
  costsEnabled: boolean;
  currency: string;
  askCostOnSingleBuy: boolean;
  askCostOnBulkBuy: boolean;
  askCostOnTripEnd: boolean;
  tripCostMode: TripCostMode;
};

export type HomeSummary = {
  id: string;
  name: string;
  role: "owner" | "partner";
  members: HouseholdMember[];
};

export const HOME_CURRENCIES: { code: HomeCurrency; labelKey: string }[] = [
  { code: "JOD", labelKey: "currencyJOD" },
  { code: "USD", labelKey: "currencyUSD" },
  { code: "EUR", labelKey: "currencyEUR" },
  { code: "ILS", labelKey: "currencyILS" },
  { code: "SAR", labelKey: "currencySAR" },
  { code: "AED", labelKey: "currencyAED" },
  { code: "EGP", labelKey: "currencyEGP" },
  { code: "GBP", labelKey: "currencyGBP" },
];

export function defaultCostSettings(): CostSettings {
  return {
    costsEnabled: false,
    currency: "JOD",
    askCostOnSingleBuy: true,
    askCostOnBulkBuy: true,
    askCostOnTripEnd: true,
    tripCostMode: "items",
  };
}
