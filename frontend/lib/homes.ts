import { api, ApiError } from "@/lib/api";
import { formatAppError } from "@/lib/errors";
import type { CostSettings, HomeSummary, Household } from "@/types/household";

export function alreadyHasHome(message: string | null | undefined) {
  const value = (message ?? "").toLowerCase();
  return value.includes("already belong") || value.includes("تنتمي إلى منزل");
}

function withCostDefaults(home: Household): Household {
  return {
    ...home,
    costsEnabled: home.costsEnabled === true,
    currency: home.currency || "JOD",
    askCostOnSingleBuy: home.askCostOnSingleBuy !== false,
    askCostOnBulkBuy: home.askCostOnBulkBuy !== false,
    askCostOnTripEnd: home.askCostOnTripEnd !== false,
  };
}

export async function fetchMyHousehold(): Promise<Household | null> {
  try {
    const home = await api.get<Household>("/homes/mine");
    return withCostDefaults(home);
  } catch (error) {
    if (error instanceof ApiError && error.code === "NO_HOME") return null;
    throw error;
  }
}

export async function createHome(name: string) {
  try {
    const home = withCostDefaults(await api.post<Household>("/homes", { name: name.trim() }));
    return { home, error: null };
  } catch (error) {
    if (error instanceof ApiError && (error.code === "ALREADY_IN_HOME" || alreadyHasHome(error.message))) {
      try {
        const existing = await fetchMyHousehold();
        if (existing) return { home: existing, error: null };
      } catch {
        // Fall through to the original error.
      }
    }
    return { home: null, error: formatAppError(error) };
  }
}

export async function joinHome(code: string) {
  try {
    const home = withCostDefaults(
      await api.post<Household>("/homes/join", { code: code.trim().toUpperCase() }),
    );
    return { home, error: null };
  } catch (error) {
    return { home: null, error: formatAppError(error) };
  }
}

export async function updateHomeName(homeId: string, name: string) {
  const homeName = name.trim();
  if (!homeName) {
    return { error: formatAppError(new ApiError("Family name is required", "FAMILY_NAME_REQUIRED")) };
  }

  try {
    await api.patch(`/homes/${homeId}`, { name: homeName });
    return { error: null };
  } catch (error) {
    return { error: formatAppError(error) };
  }
}

export async function updateCostSettings(homeId: string, settings: Partial<CostSettings>) {
  try {
    const home = withCostDefaults(
      await api.patch<Household>(`/homes/${homeId}/cost-settings`, settings),
    );
    return { home, error: null };
  } catch (error) {
    return { home: null, error: formatAppError(error) };
  }
}

export async function fetchMyHomes() {
  try {
    const homes = await api.get<HomeSummary[]>("/homes");
    return { homes, error: null };
  } catch (error) {
    return { homes: [] as HomeSummary[], error: formatAppError(error) };
  }
}

export async function switchHome(homeId: string) {
  try {
    const home = withCostDefaults(await api.post<Household>(`/homes/${homeId}/switch`));
    return { home, error: null };
  } catch (error) {
    return { home: null, error: formatAppError(error) };
  }
}

export async function leaveHome(homeId: string) {
  try {
    const result = await api.post<{ home: Household | null }>(`/homes/${homeId}/leave`);
    return { home: result.home ? withCostDefaults(result.home) : null, error: null };
  } catch (error) {
    return { home: null, error: formatAppError(error) };
  }
}

export async function removeHomeMember(homeId: string, userId: string) {
  try {
    await api.delete(`/homes/${homeId}/members/${userId}`);
    return { error: null };
  } catch (error) {
    return { error: formatAppError(error) };
  }
}
