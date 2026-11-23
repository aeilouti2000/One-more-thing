import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { cachedIcons, fetchIcons } from "@/features/icons/api";
import type { HomeIcon } from "@/features/icons/types";
import { useHousehold } from "@/features/homes/hooks/use-household";
import { qk, queryClient } from "@/features/offline/query-client";

const NO_ICONS: HomeIcon[] = [];

/**
 * The home's icons: a window onto the saved copy (qk.icons), which sync and
 * every icon change keep up to date. It never loads by itself.
 */
export function useHomeIcons(): HomeIcon[] {
  const { household } = useHousehold();
  const homeId = household?.id ?? "none";
  const { data } = useQuery<HomeIcon[]>(
    {
      queryKey: qk.icons(homeId),
      queryFn: () => cachedIcons(homeId) ?? NO_ICONS,
      enabled: false,
    },
    queryClient,
  );
  return household ? (data ?? NO_ICONS) : NO_ICONS;
}

/**
 * Loads the icons when a screen that shows them opens. `always`: also when
 * the phone already has a copy (the Categories settings screen).
 */
export function useLoadIcons(always = false) {
  const { household } = useHousehold();
  const homeId = household?.id ?? null;
  useEffect(() => {
    if (!homeId) return;
    if (always || cachedIcons(homeId) === undefined) void fetchIcons(homeId);
  }, [always, homeId]);
}
