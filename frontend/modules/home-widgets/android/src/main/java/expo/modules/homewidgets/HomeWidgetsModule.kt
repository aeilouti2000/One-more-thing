package expo.modules.homewidgets

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/** What the app's TypeScript can call (see modules/home-widgets/src/index.ts). */
class HomeWidgetsModule : Module() {
  private val context: Context?
    get() = appContext.reactContext?.applicationContext

  override fun definition() = ModuleDefinition {
    Name("HomeWidgets")

    /** This build draws see-through ("glass") widgets; the app offers them only then. */
    Constant("supportsGlass") { true }

    /** New data for the widgets, as JSON text. Redraws them when it changed. */
    Function("setSnapshot") { json: String ->
      val context = context ?: return@Function
      val changed = WidgetStore.setSnapshot(context, json)
      WidgetStore.setLastRefreshAt(context, System.currentTimeMillis())
      // Signed out or left the home: taps made for the old home must not be sent.
      val dropped = WidgetStore.snapshot(context)?.ready != true && WidgetStore.clearPending(context)
      if (changed || dropped) WidgetRenderer.updateAll(context)
    }

    /** The taps made on widgets that still have to be sent, as JSON text. */
    Function("getPendingActions") {
      val context = context ?: return@Function "[]"
      WidgetStore.pendingJson(context)
    }

    /** These taps are dealt with (sent, or no longer possible). */
    Function("completeActions") { ids: List<String> ->
      val context = context ?: return@Function
      if (!WidgetStore.complete(context, ids)) return@Function
      WidgetRenderer.refreshCollection(context, WidgetKind.LIST)
      WidgetRenderer.refreshCollection(context, WidgetKind.PINS)
    }

    /** The end of a background run; retry = the server could not be reached. */
    Function("finishSync") { reason: String, retry: Boolean ->
      WidgetSync.results[reason] = retry
    }

    Function("setBackgroundSync") { enabled: Boolean ->
      val context = context ?: return@Function
      WidgetStore.setBackgroundSync(context, enabled)
    }

    /** How many of each widget are on the home screen, and whether the app can offer to add one. */
    Function("getStatus") {
      val context = context
      val status = mutableMapOf<String, Any>("canPin" to (context != null && canPin(context)))
      for (kind in WidgetKind.values()) {
        status[kind.key] = if (context == null) 0 else WidgetRenderer.count(context, kind)
      }
      status
    }

    /** Shows the phone's "add this widget to the home screen?" prompt. */
    Function("requestPin") { kind: String ->
      val context = context ?: return@Function false
      val target = WidgetKind.of(kind) ?: return@Function false
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O || !canPin(context)) return@Function false
      try {
        AppWidgetManager.getInstance(context)
          .requestPinAppWidget(ComponentName(context, target.provider), null, null)
      } catch (_: Exception) {
        false
      }
    }
  }

  private fun canPin(context: Context): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return false
    return try {
      AppWidgetManager.getInstance(context).isRequestPinAppWidgetSupported
    } catch (_: Exception) {
      false
    }
  }
}
