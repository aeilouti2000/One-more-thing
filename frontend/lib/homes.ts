import { translate } from "@/constants/i18n";
import { formatAppError, logError } from "@/lib/errors";
import { ensureProfile, requireUser } from "@/lib/profile";
import { supabase } from "@/lib/supabase";
import type { HomeRow } from "@/types/database";
import type { Household } from "@/types/household";

export function alreadyHasHome(message: string | null | undefined) {
  const value = (message ?? "").toLowerCase();
  return value.includes("already belong") || value.includes("تنتمي إلى منزل");
}

function toHousehold(home: HomeRow, userId: string, role: "owner" | "partner"): Household {
  return {
    id: home.id,
    name: home.name,
    inviteCode: home.invite_code,
    members: [{ id: userId, role, name: "Member" }],
  };
}

export async function fetchMyHousehold(): Promise<Household | null> {
  const { data, error } = await supabase.rpc("get_my_home");
  if (!error && data) {
    const row = data as {
      id: string;
      name: string;
      invite_code: string;
      members?: { id: string; role: "owner" | "partner"; name: string }[];
    };
    if (row.id) {
      return {
        id: row.id,
        name: row.name,
        inviteCode: row.invite_code,
        members: row.members ?? [],
      };
    }
  }

  const { user } = await requireUser();
  if (!user) return null;

  const { data: membership } = await supabase
    .from("home_members")
    .select("home_id, role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) return null;

  const { data: home } = await supabase
    .from("homes")
    .select("id, name, invite_code, created_at")
    .eq("id", (membership as { home_id: string }).home_id)
    .maybeSingle();

  if (!home) return null;

  return toHousehold(home as HomeRow, user.id, (membership as { role: "owner" | "partner" }).role);
}

export async function createHome(name: string) {
  const homeName = name.trim();
  const { user, error: userError } = await requireUser();
  if (!user) {
    return { home: null, error: userError };
  }

  const profileError = await ensureProfile(user);
  if (profileError) {
    return { home: null, error: profileError };
  }

  const rpc = await supabase.rpc("create_home", { p_name: homeName });
  if (!rpc.error) {
    return { home: rpc.data as HomeRow, error: null };
  }

  if (alreadyHasHome(rpc.error.message)) {
    const existing = await fetchMyHousehold();
    if (existing) {
      return {
        home: {
          id: existing.id,
          name: existing.name,
          invite_code: existing.inviteCode,
          created_at: new Date().toISOString(),
        },
        error: null,
      };
    }
  }

  logError("create_home", rpc.error);
  return { home: null, error: formatAppError(rpc.error) };
}

export async function joinHome(code: string) {
  const inviteCode = code.trim().toUpperCase();
  const { user, error: userError } = await requireUser();
  if (!user) {
    return { home: null, error: userError };
  }

  const profileError = await ensureProfile(user);
  if (profileError) {
    return { home: null, error: profileError };
  }

  const rpc = await supabase.rpc("join_home", { p_code: inviteCode });
  if (!rpc.error) {
    return { home: rpc.data as HomeRow, error: null };
  }

  logError("join_home", rpc.error);
  return { home: null, error: formatAppError(rpc.error) };
}

export async function updateHomeName(homeId: string, name: string) {
  const homeName = name.trim();
  if (!homeName) {
    return { error: translate("errorEnterFamilyName") };
  }

  const rpc = await supabase.rpc("update_home_name", {
    p_home_id: homeId,
    p_name: homeName,
  });

  if (!rpc.error) {
    return { error: null };
  }

  logError("update_home_name", rpc.error);
  return { error: formatAppError(rpc.error) };
}

export async function removeHomeMember(homeId: string, userId: string) {
  const { error } = await supabase.rpc("remove_home_member", {
    p_home_id: homeId,
    p_user_id: userId,
  });

  if (error) {
    logError("remove_home_member", error);
    return { error: formatAppError(error) };
  }

  return { error: null };
}
