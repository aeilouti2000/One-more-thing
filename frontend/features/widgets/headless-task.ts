import { AppRegistry, Platform } from "react-native";
import { syncWidgets } from "@/features/widgets/sync";
import { finishWidgetSync } from "@/modules/home-widgets/src";

/**
 * Android starts this while the app is closed: when a widget is tapped
 * ("actions") and about every 30 minutes ("refresh"). It runs the app's own
 * code with no screen, so sign-in, token refresh and the API calls are the
 * same ones the app uses. The name is repeated in WidgetSyncJobService (Kotlin).
 */
const TASK = "OmtWidgetSync";

if (Platform.OS === "android") {
  AppRegistry.registerHeadlessTask(TASK, () => async (data: unknown) => {
    const reason =
      typeof data === "object" && data !== null && (data as { reason?: unknown }).reason === "actions"
        ? "actions"
        : "refresh";
    let retry = reason === "actions";
    try {
      retry = (await syncWidgets()).retry;
    } catch {
      // Unexpected: taps stay stored and are sent on the next run.
    }
    // A missed refresh is not worth a retry; the next one is close.
    finishWidgetSync(reason, reason === "actions" && retry);
  });
}
