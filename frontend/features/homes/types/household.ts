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
  /** What the home plans to spend in a calendar month; null = no budget. */
  monthlyBudget: number | null;
  /** Show last month's recap in History at the start of a month. */
  monthlyRecap: boolean;
};

export type TripSettings = {
  /** Ask for a name (e.g. the shop) when a shopping trip ends. */
  tripAskName: boolean;
  /** A trip left open ends by itself after this many hours; null = never. */
  tripAutoEndHours: number | null;
  /** Show a summary card (bought, left, total, time) when a trip ends. */
  tripSummary: boolean;
  /** Let more than one person shop the same list at the same time. */
  tripShopTogether: boolean;
  /** Show the whole-trip estimate, and what it leaves of the budget, on a trip. */
  tripEstimate: boolean;
  /** Offer "Anything missing?" on a trip, to ask the rest of the home. */
  tripAskHome: boolean;
};

export const TRIP_AUTO_END_HOURS = [2, 4, 8] as const;

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
  /** Host switch: off means nobody in this home gets list notifications. */
  notificationsEnabled: boolean;
  monthlyBudget: number | null;
  tripAskName: boolean;
  tripAutoEndHours: number | null;
  tripSummary: boolean;
  tripShopTogether: boolean;
  tripEstimate: boolean;
  tripAskHome: boolean;
  monthlyRecap: boolean;
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
