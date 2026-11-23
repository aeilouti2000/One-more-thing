package expo.modules.homewidgets

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.view.View
import android.widget.RemoteViews

/**
 * Builds what each widget shows. A widget lives in the home screen's process,
 * not ours, so it is described as RemoteViews: a layout plus a list of
 * "set this text / colour / click" instructions the home screen replays.
 */
internal object WidgetRenderer {
  const val ACTION_TAP = "expo.modules.homewidgets.TAP"
  const val EXTRA_KIND = "kind"
  const val EXTRA_TARGET = "target"

  /** The app's link scheme (app.json "scheme"). */
  private const val SCHEME = "onemorething"

  fun updateAll(context: Context) {
    for (kind in WidgetKind.values()) update(context, kind)
  }

  fun update(context: Context, kind: WidgetKind, ids: IntArray? = null) {
    val manager = AppWidgetManager.getInstance(context) ?: return
    val widgetIds = ids ?: idsOf(context, manager, kind)
    if (widgetIds.isEmpty()) return
    val snapshot = WidgetStore.snapshot(context)
    for (id in widgetIds) {
      manager.updateAppWidget(id, build(context, kind, id, snapshot))
    }
    if (kind.hasCollection) refreshRows(manager, widgetIds)
  }

  /** The rows changed (a tap is waiting, or was sent) but nothing around them did. */
  fun refreshCollection(context: Context, kind: WidgetKind) {
    val manager = AppWidgetManager.getInstance(context) ?: return
    val widgetIds = idsOf(context, manager, kind)
    if (widgetIds.isNotEmpty()) refreshRows(manager, widgetIds)
  }

  fun count(context: Context, kind: WidgetKind): Int {
    val manager = AppWidgetManager.getInstance(context) ?: return 0
    return idsOf(context, manager, kind).size
  }

  private fun idsOf(context: Context, manager: AppWidgetManager, kind: WidgetKind): IntArray =
    manager.getAppWidgetIds(ComponentName(context, kind.provider)) ?: IntArray(0)

  @Suppress("DEPRECATION") // The replacement needs Android 12; this works on all of them.
  private fun refreshRows(manager: AppWidgetManager, ids: IntArray) {
    manager.notifyAppWidgetViewDataChanged(ids, R.id.hw_collection)
  }

  private fun build(context: Context, kind: WidgetKind, widgetId: Int, snapshot: Snapshot?): RemoteViews {
    val painter = Painter(context, snapshot)
    if (snapshot == null || !snapshot.ready) {
      return message(context, painter, snapshot, snapshot?.messageTitle.orEmpty(), snapshot?.messageBody.orEmpty(), "")
    }
    return when (kind) {
      WidgetKind.LIST -> collection(context, painter, snapshot, kind, widgetId, snapshot.list, R.layout.hw_rows)
      WidgetKind.PULSE -> collection(context, painter, snapshot, kind, widgetId, snapshot.pulse, R.layout.hw_rows)
      WidgetKind.PINS -> collection(context, painter, snapshot, kind, widgetId, snapshot.pins, R.layout.hw_grid)
      WidgetKind.BUDGET -> budget(context, painter, snapshot)
    }
  }

  private fun base(context: Context, painter: Painter, snapshot: Snapshot?, layout: Int): RemoteViews {
    val views = RemoteViews(context.packageName, layout)
    painter.fill(views, R.id.hw_bg, painter.bgAlpha) { it.bg }
    views.setViewVisibility(R.id.hw_edge, if (painter.isGlass) View.VISIBLE else View.GONE)
    if (snapshot != null) {
      // The app's own language decides the direction, not the phone's.
      views.setInt(
        R.id.hw_root,
        "setLayoutDirection",
        if (snapshot.rtl) View.LAYOUT_DIRECTION_RTL else View.LAYOUT_DIRECTION_LTR,
      )
    }
    return views
  }

  private fun message(
    context: Context,
    painter: Painter,
    snapshot: Snapshot?,
    title: String,
    body: String,
    route: String,
  ): RemoteViews {
    val views = base(context, painter, snapshot, R.layout.hw_message)
    // With nothing from the app yet, the layout's own built-in text stays.
    if (title.isNotEmpty()) views.setTextViewText(R.id.hw_title, title)
    if (title.isNotEmpty() || body.isNotEmpty()) views.setTextViewText(R.id.hw_subtitle, body)
    painter.text(views, R.id.hw_title) { it.ink }
    painter.text(views, R.id.hw_subtitle) { it.muted }
    views.setOnClickPendingIntent(R.id.hw_root, openApp(context, route))
    return views
  }

  private fun collection(
    context: Context,
    painter: Painter,
    snapshot: Snapshot,
    kind: WidgetKind,
    widgetId: Int,
    section: Section<*>,
    layout: Int,
  ): RemoteViews {
    val views = base(context, painter, snapshot, layout)
    views.setTextViewText(R.id.hw_title, section.title)
    views.setTextViewText(R.id.hw_subtitle, section.subtitle)
    views.setTextViewText(R.id.hw_empty_title, section.emptyTitle)
    views.setTextViewText(R.id.hw_empty_body, section.emptyBody)
    painter.text(views, R.id.hw_title) { it.ink }
    painter.text(views, R.id.hw_subtitle) { it.muted }
    painter.text(views, R.id.hw_empty_title) { it.ink }
    painter.text(views, R.id.hw_empty_body) { it.muted }

    val showAdd = kind == WidgetKind.LIST
    views.setViewVisibility(R.id.hw_add, if (showAdd) View.VISIBLE else View.GONE)
    if (showAdd) {
      painter.tint(views, R.id.hw_add_bg) { it.fill }
      painter.tint(views, R.id.hw_add_icon) { it.onFill }
      views.setOnClickPendingIntent(R.id.hw_add, openApp(context, WidgetKind.LIST.route))
    }
    val open = openApp(context, kind.route)
    views.setOnClickPendingIntent(R.id.hw_header, open)
    views.setOnClickPendingIntent(R.id.hw_empty, open)

    // The rows come from WidgetCollectionService, asked by the home screen.
    val adapter = Intent(context, WidgetCollectionService::class.java)
      .putExtra(EXTRA_KIND, kind.key)
      .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId)
    // Intents that differ only in extras count as the same one; the data makes each unique.
    adapter.data = Uri.parse(adapter.toUri(Intent.URI_INTENT_SCHEME))
    @Suppress("DEPRECATION")
    views.setRemoteAdapter(R.id.hw_collection, adapter)
    views.setEmptyView(R.id.hw_collection, R.id.hw_empty)
    // One shared click for every row; each row adds which item it is.
    views.setPendingIntentTemplate(
      R.id.hw_collection,
      if (kind == WidgetKind.PULSE) open else tapTemplate(context, kind),
    )
    return views
  }

  private fun budget(context: Context, painter: Painter, snapshot: Snapshot): RemoteViews {
    val data = snapshot.budget
    if (!data.showRing) {
      return message(context, painter, snapshot, data.title, data.body, WidgetKind.BUDGET.route)
    }
    val views = base(context, painter, snapshot, R.layout.hw_budget)
    val tone: (Palette) -> Int = when (data.tone) {
      "danger" -> { palette -> palette.danger }
      "warn" -> { palette -> palette.warn }
      else -> { palette -> palette.fill }
    }
    painter.image(views, R.id.hw_ring) {
      drawRing(context, data.fraction, tone(it), withAlpha(it.track, painter.trackAlpha))
    }
    views.setTextViewText(R.id.hw_center, data.center)
    views.setTextViewText(R.id.hw_center_sub, data.centerSub)
    views.setTextViewText(R.id.hw_line1, data.line1)
    views.setTextViewText(R.id.hw_line2, data.line2)
    views.setViewVisibility(R.id.hw_line2, if (data.line2.isEmpty()) View.GONE else View.VISIBLE)
    val over = data.tone == "danger"
    painter.text(views, R.id.hw_center) { if (over) it.danger else it.ink }
    painter.text(views, R.id.hw_center_sub) { it.muted }
    painter.text(views, R.id.hw_line1) { if (over) it.danger else it.ink }
    painter.text(views, R.id.hw_line2) { it.muted }
    views.setOnClickPendingIntent(R.id.hw_root, openApp(context, WidgetKind.BUDGET.route))
    return views
  }

  /** Opens the app on one of its pages, through the app's own link scheme. */
  private fun openApp(context: Context, route: String): PendingIntent {
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse("$SCHEME://$route"))
      .setPackage(context.packageName)
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    return PendingIntent.getActivity(
      context,
      route.hashCode(),
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }

  private fun tapTemplate(context: Context, kind: WidgetKind): PendingIntent {
    val intent = Intent(context, WidgetTapReceiver::class.java).setAction(ACTION_TAP)
    // Mutable, so each row can add which item was tapped.
    val mutable = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_MUTABLE else 0
    return PendingIntent.getBroadcast(
      context,
      kind.ordinal,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or mutable,
    )
  }
}
