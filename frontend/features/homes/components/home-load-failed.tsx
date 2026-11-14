import { useState } from "react";
import { ProblemScreen } from "@/components/ui/ProblemScreen";
import { useAuth } from "@/features/auth/providers/auth-provider";
import { useHousehold } from "@/features/homes/hooks/use-household";
import { useI18n } from "@/providers/LanguageProvider";

/**
 * The home could not be loaded (and none is saved on this phone). Shown
 * instead of "Create a home": not knowing is different from not having one.
 */
export function HomeLoadFailed() {
  const { refresh, error } = useHousehold();
  const { signOut } = useAuth();
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);

  async function retry() {
    setBusy(true);
    await refresh();
    setBusy(false);
  }

  return (
    <ProblemScreen
      title={t("homeLoadFailedTitle")}
      body={error ?? t("errorNetwork")}
      primaryLabel={t("tryAgain")}
      onPrimary={() => void retry()}
      busy={busy}
      secondaryLabel={t("logOut")}
      onSecondary={() => void signOut()}
    />
  );
}
