import { useCallback, useEffect, useRef } from "react";
import { AppState } from "react-native";
import { useAuth } from "@/features/auth/providers/auth-provider";
import { useHousehold } from "@/features/homes/hooks/use-household";
import { fetchLists, type HomeList } from "@/features/items/api/lists";
import { fetchPins, type Pin } from "@/features/items/api/pins";
import { usePurchasesData } from "@/features/items/hooks/use-purchases";
import { readCachedLists, readCachedPins } from "@/features/offline/profile-cache";
import { publishWidgets, syncWidgets } from "@/features/widgets/sync";
import { readWidgetBackground } from "@/features/widgets/widget-prefs";
import {
  readWidgetActions,
  setWidgetBackgroundSync,
  widgetsAvailable,
} from "@/modules/home-widgets/src";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";

/** Lists and pins are asked for again when the app comes back, at most this often. */
const EXTRAS_EVERY_MS = 60_000;
/** Several changes in a row (a trip, a bulk edit) become one update. */
const SETTLE_MS = 400;

/**
 * Keeps the home screen widgets showing what the app shows. Renders nothing.
 * While the app is closed, features/widgets/headless-task.ts takes over.
 */
export function WidgetPublisher() {
  const { user, isLoading: isAuthLoading } = useAuth();
  const { household, isLoading: isHomeLoading, loadFailed } = useHousehold();
  const { purchases, isLoading: isItemsLoading } = usePurchasesData();
  const { preference, accent, surfaceDepth } = useTheme();
  const { locale } = useI18n();
  const userId = user?.id ?? null;
  const homeId = household?.id ?? null;
  const extrasAt = useRef(0);

  const publish = useCallback(() => {
    if (!widgetsAvailable || isAuthLoading) return;
    const look = { locale, theme: { preference, accent, surfaceDepth } };
    if (!userId) {
      publishWidgets({ user: null, household: null, items: [], lists: [], pins: [] }, look);
      return;
    }
    if (!household) {
      // Not loaded (or it failed) is not the same as "has no home".
      if (isHomeLoading || loadFailed) return;
      publishWidgets({ user: { id: userId }, household: null, items: [], lists: [], pins: [] }, look);
      return;
    }
    // Nothing saved on this phone yet and the first answer is still on its way.
    if (isItemsLoading && purchases.length === 0) return;
    publishWidgets(
      {
        user: { id: userId },
        household,
        items: purchases,
        // Kept fresh by the screens that show them, and by refreshExtras below.
        lists: readCachedLists<HomeList>(household.id) ?? [],
        pins: readCachedPins<Pin>(household.id) ?? [],
      },
      look,
    );
  }, [
    accent,
    household,
    isAuthLoading,
    isHomeLoading,
    isItemsLoading,
    loadFailed,
    locale,
    preference,
    purchases,
    surfaceDepth,
    userId,
  ]);

  const publishRef = useRef(publish);
  useEffect(() => {
    publishRef.current = publish;
  }, [publish]);

  // Whenever what the widgets show changes in the app.
  useEffect(() => {
    if (!widgetsAvailable) return;
    const timer = setTimeout(publish, SETTLE_MS);
    return () => clearTimeout(timer);
  }, [publish]);

  // The native side keeps its own copy of the switch (it decides without the app).
  useEffect(() => {
    setWidgetBackgroundSync(readWidgetBackground());
  }, []);

  useEffect(() => {
    if (!widgetsAvailable || !userId || !homeId) return;
    let active = true;

    const cameBack = () => {
      // Taps made on a widget that a background run has not sent yet.
      if (readWidgetActions().length > 0) void syncWidgets();
      if (Date.now() - extrasAt.current < EXTRAS_EVERY_MS) return;
      extrasAt.current = Date.now();
      // Both save their answer on the phone; the next publish reads it from there.
      void Promise.all([fetchLists(homeId), fetchPins(homeId)]).then(() => {
        if (active) publishRef.current();
      });
    };

    cameBack();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") cameBack();
      // Leaving for the home screen: the list picked in the app, pins edited
      // just now and the like are on the phone by now.
      else publishRef.current();
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, [homeId, userId]);

  return null;
}
