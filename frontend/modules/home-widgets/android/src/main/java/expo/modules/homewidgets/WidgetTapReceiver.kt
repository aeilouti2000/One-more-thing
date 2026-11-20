package expo.modules.homewidgets

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * A row or a tile was tapped. The widget shows the result at once and keeps
 * the tap in WidgetStore; the app's code then sends it to the server.
 */
class WidgetTapReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != WidgetRenderer.ACTION_TAP) return
    val target = intent.getStringExtra(WidgetRenderer.EXTRA_TARGET)?.takeIf { it.isNotEmpty() } ?: return
    val snapshot = WidgetStore.snapshot(context)?.takeIf { it.ready } ?: return

    when (WidgetKind.of(intent.getStringExtra(WidgetRenderer.EXTRA_KIND))) {
      WidgetKind.LIST -> {
        if (snapshot.list.items.none { it.id == target }) return
        // A second tap before it is sent takes the tick back.
        val waiting = WidgetStore.toggle(context, PendingAction.BUY, target)
        WidgetRenderer.refreshCollection(context, WidgetKind.LIST)
        if (waiting) WidgetSync.requestActions(context)
      }
      WidgetKind.PINS -> {
        val pin = snapshot.pins.items.firstOrNull { it.id == target } ?: return
        // Already on the list: nothing to add.
        if (pin.onList) return
        if (!WidgetStore.addOnce(context, PendingAction.PIN, target)) return
        WidgetRenderer.refreshCollection(context, WidgetKind.PINS)
        WidgetSync.requestActions(context)
      }
      else -> Unit
    }
  }
}
