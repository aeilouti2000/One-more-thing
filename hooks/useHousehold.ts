import { MOCK_HOUSEHOLD } from "@/constants/mock-data";
import type { Household } from "@/types/household";

type UseHouseholdResult = {
  household: Household | null;
  hasHousehold: boolean;
  isLoading: boolean;
};

/** Placeholder until auth and persistence are added. */
export function useHousehold(): UseHouseholdResult {
  return {
    household: MOCK_HOUSEHOLD,
    hasHousehold: false,
    isLoading: false,
  };
}
