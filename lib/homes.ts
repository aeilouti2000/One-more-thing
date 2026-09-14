import type { User } from "@supabase/supabase-js";
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

function generateInviteCode() {
  const bytes = new Uint8Array(4);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  const hex = Array.from(bytes, (value) =>
    value.toString(16).padStart(2, "0"),
  )
    .join("")
    .toUpperCase();
  return `OMT-${hex}`;
}

function isRpcUnavailable(error: { code?: string; message?: string } | null) {
  const message = error?.message?.toLowerCase() ?? "";
  return (
    error?.code === "PGRST202" ||
    error?.code === "42883" ||
    message.includes("could not find the function")
  );
}

async function createHomeDirect(name: string, user: User) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const inviteCode = generateInviteCode();
    const { data, error } = await supabase
      .from("homes")
      .insert({ name, invite_code: inviteCode })
      .select("id, name, invite_code, created_at")
      .single();

    if (error) {
      if (error.code === "23505" && error.message.includes("invite_code")) {
        continue;
      }
      logError("create_home_insert", error);
      return { home: null, error: formatAppError(error) };
    }

    const { error: memberError } = await supabase.from("home_members").insert({
      home_id: (data as HomeRow).id,
      user_id: user.id,
      role: "owner",
    });

    if (memberError) {
      logError("create_home_member", memberError);
      const message = formatAppError(memberError);
      if (alreadyHasHome(message)) {
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
      return { home: null, error: message };
    }

    return { home: data as HomeRow, error: null };
  }

  return {
    home: null,
    error: translate("errorInviteCodeBusy"),
  };
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

  if (!isRpcUnavailable(rpc.error)) {
    logError("create_home", rpc.error);
    return { home: null, error: formatAppError(rpc.error) };
  }

  return createHomeDirect(homeName, user);
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
