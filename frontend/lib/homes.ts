import { api, ApiError } from "@/lib/api";
import { formatAppError } from "@/lib/errors";
import type { Household } from "@/types/household";

export function alreadyHasHome(message: string | null | undefined) {
  const value = (message ?? "").toLowerCase();
  return value.includes("already belong") || value.includes("تنتمي إلى منزل");
}

export async function fetchMyHousehold(): Promise<Household | null> {
  try {
    return await api.get<Household>("/homes/mine");
  } catch (error) {
    if (error instanceof ApiError && error.code === "NO_HOME") return null;
    throw error;
  }
}

export async function createHome(name: string) {
  try {
    const home = await api.post<Household>("/homes", { name: name.trim() });
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
    const home = await api.post<Household>("/homes/join", { code: code.trim().toUpperCase() });
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

export async function removeHomeMember(homeId: string, userId: string) {
  try {
    await api.delete(`/homes/${homeId}/members/${userId}`);
    return { error: null };
  } catch (error) {
    return { error: formatAppError(error) };
  }
}
