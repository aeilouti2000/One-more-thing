package expo.modules.homewidgets

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.os.Bundle

/**
 * Android talks to a widget through one of these. It is called when a widget
 * is added, resized, and every 30 minutes (see res/xml/hw_*_info.xml).
 */
abstract class BaseWidgetProvider internal constructor(private val kind: WidgetKind) : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    WidgetRenderer.update(context, kind, ids)
    // Redrawn from what is stored; now ask the app's code for newer data.
    WidgetSync.requestRefresh(context)
  }

  override fun onAppWidgetOptionsChanged(
    context: Context,
    manager: AppWidgetManager,
    id: Int,
    options: Bundle?,
  ) {
    WidgetRenderer.update(context, kind, intArrayOf(id))
  }
}

class ListWidgetProvider : BaseWidgetProvider(WidgetKind.LIST)

class BudgetWidgetProvider : BaseWidgetProvider(WidgetKind.BUDGET)

class PinsWidgetProvider : BaseWidgetProvider(WidgetKind.PINS)

class PulseWidgetProvider : BaseWidgetProvider(WidgetKind.PULSE)
