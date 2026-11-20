package expo.modules.homewidgets

import android.appwidget.AppWidgetProvider

/** The four widgets. `route` is the app page a tap on the widget opens. */
internal enum class WidgetKind(
  val key: String,
  val provider: Class<out AppWidgetProvider>,
  val route: String,
  val hasCollection: Boolean,
) {
  LIST("list", ListWidgetProvider::class.java, "items", true),
  BUDGET("budget", BudgetWidgetProvider::class.java, "history", false),
  PINS("pins", PinsWidgetProvider::class.java, "pins", true),
  PULSE("pulse", PulseWidgetProvider::class.java, "history", true);

  companion object {
    fun of(key: String?): WidgetKind? = values().firstOrNull { it.key == key }
  }
}
