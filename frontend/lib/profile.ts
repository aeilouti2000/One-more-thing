import type { User } from "@supabase/supabase-js";
import { translate } from "@/constants/i18n";
import { formatAppError, logError } from "@/lib/errors";
import { supabase } from "@/lib/supabase";

function displayName(user: User) {
  return (
    (typeof user.user_metadata?.name === "string" &&
      user.user_metadata.name.trim()) ||
    "Member"
  );
}

export async function requireUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return { user: null, error: translate("errorNeedLogin") };
  }
  return { user: data.user, error: null };
}

export async function ensureProfile(user?: User) {
  const current = user ?? (await supabase.auth.getUser()).data.user;
  if (!current) {
    return translate("errorNeedLogin");
  }

  const { data: existing } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", current.id)
    .maybeSingle();

  if (existing) {
    return null;
  }

  const rpc = await supabase.rpc("ensure_profile");
  if (!rpc.error) {
    return null;
  }

  const { error } = await supabase.from("profiles").upsert(
    { id: current.id, name: displayName(current) },
    { onConflict: "id" },
  );

  if (!error) {
    return null;
  }

  logError("ensure_profile", error);
  return formatAppError(error);
}
