export type HouseholdMember = {
  id: string;
  name: string;
  role: "owner" | "partner";
};

export type HomeCurrency = "JOD" | "USD" | "EUR" | "ILS" | "SAR" | "AED" | "EGP" | "GBP";

export type CostSettings = {
  costsEnabled: boolean;
  currency: HomeCurrency | string;
  askCostOnSingleBuy: boolean;
  askCostOnBulkBuy: boolean;
  askCostOnTripEnd: boolean;
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
};

export type HomeSummary = {
  id: string;
  name: string;
  role: "owner" | "partner";
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
  };
}
