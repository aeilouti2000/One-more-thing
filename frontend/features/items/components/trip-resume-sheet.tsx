import { router } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { AppButton } from "@/components/ui/AppButton";
import { AppText } from "@/components/ui/AppText";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { listLabel } from "@/features/items/api/lists";
import {
  canAskToResume,
  clearStoredTrip,
  isStoredTripStale,
  markResumeAsked,
  readStoredTrip,
  type StoredTrip,
} from "@/features/items/utils/trip-session";
import { useI18n } from "@/providers/LanguageProvider";

/** A trip still open when the app last closed: worth continuing? */
function findTrip(homeId: string, autoEndHours: number | null): StoredTrip | null {
  if (!canAskToResume(homeId)) return null;
  const trip = readStoredTrip(homeId);
  if (!trip || trip.boughtIds.length === 0) return null;
  if (isStoredTripStale(trip, autoEndHours)) return null;
  return trip;
}

/**
 * "Continue your trip?" once per app start, when the app closed during a trip.
 * Mount it with key={homeId} so another home checks again.
 */
export function TripResumeSheet({
  homeId,
  autoEndHours,
}: {
  homeId: string;
  autoEndHours: number | null;
}) {
  const { t } = useI18n();
  const [trip] = useState(() => findTrip(homeId, autoEndHours));
  const [open, setOpen] = useState(trip !== null);

  useEffect(() => {
    markResumeAsked(homeId);
    // Too old to continue: forget it.
    const stored = readStoredTrip(homeId);
    if (stored && isStoredTripStale(stored, autoEndHours)) clearStoredTrip(homeId);
  }, [autoEndHours, homeId]);

  if (!trip) return null;

  function go(end: boolean) {
    if (!trip) return;
    setOpen(false);
    // Let the sheet close before the trip page rises.
    setTimeout(() => {
      router.push({
        pathname: "/trip",
        params: {
          listId: trip.listId,
          listName: trip.listName,
          category: trip.category ?? "",
          resume: "1",
          ...(end ? { end: "1" } : {}),
        },
      });
    }, 300);
  }

  return (
    <BottomSheet visible={open} onClose={() => setOpen(false)}>
      <View className="gap-4">
        <AppText className="text-xl font-semibold text-cove-ink">{t("tripResumeTitle")}</AppText>
        <AppText className="text-sm text-cove-muted">
          {t("tripResumeBody", {
            list: listLabel(trip.listName, t("defaultList")),
            count: trip.boughtIds.length,
          })}
        </AppText>
        <AppButton label={t("tripResumeContinue")} onPress={() => go(false)} />
        <AppButton label={t("tripResumeEnd")} variant="secondary" onPress={() => go(true)} />
      </View>
    </BottomSheet>
  );
}
