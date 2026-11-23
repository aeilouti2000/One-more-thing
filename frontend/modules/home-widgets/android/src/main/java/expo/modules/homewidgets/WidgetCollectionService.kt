package expo.modules.homewidgets

import android.content.Context
import android.content.Intent
import android.graphics.Paint
import android.text.format.DateFormat
import android.text.format.DateUtils
import android.view.View
import android.widget.RemoteViews
import android.widget.RemoteViewsService
import java.util.Date

/** The home screen asks this service for a widget's rows, one at a time. */
class WidgetCollectionService : RemoteViewsService() {
  override fun onGetViewFactory(intent: Intent): RemoteViewsFactory {
    val kind = WidgetKind.of(intent.getStringExtra(WidgetRenderer.EXTRA_KIND)) ?: WidgetKind.LIST
    return CollectionFactory(applicationContext, kind)
  }
}

private class CollectionFactory(
  private val context: Context,
  private val kind: WidgetKind,
) : RemoteViewsService.RemoteViewsFactory {
  @Volatile private var snapshot: Snapshot? = null
  @Volatile private var painter = Painter(context, null)
  /** Items ticked (or pins tapped) on the widget and not sent yet. */
  @Volatile private var waiting: Set<String> = emptySet()

  override fun onCreate() = Unit

  override fun onDestroy() = Unit

  /** The home screen was told the rows changed. */
  override fun onDataSetChanged() = load()

  /**
   * Android keeps this object alive and may ask it for rows again without
   * saying they changed (after the widget swapped its whole layout, say). So
   * the data is read again here too: the count is always asked for first.
   */
  override fun getCount(): Int {
    load()
    return when (kind) {
      WidgetKind.LIST -> snapshot?.list?.items?.size ?: 0
      WidgetKind.PINS -> snapshot?.pins?.items?.size ?: 0
      WidgetKind.PULSE -> snapshot?.pulse?.items?.size ?: 0
      WidgetKind.BUDGET -> 0
    }
  }

  @Synchronized
  private fun load() {
    val current = WidgetStore.snapshot(context)?.takeIf { it.ready }
    snapshot = current
    painter = Painter(context, current)
    val type = if (kind == WidgetKind.PINS) PendingAction.PIN else PendingAction.BUY
    waiting = WidgetStore.pending(context).filter { it.type == type }.map { it.target }.toSet()
  }

  override fun getViewAt(position: Int): RemoteViews? {
    val data = snapshot ?: return null
    return when (kind) {
      WidgetKind.LIST -> data.list.items.getOrNull(position)?.let(::listRow)
      WidgetKind.PINS -> data.pins.items.getOrNull(position)?.let(::pinTile)
      WidgetKind.PULSE -> data.pulse.items.getOrNull(position)?.let(::pulseRow)
      WidgetKind.BUDGET -> null
    }
  }

  private fun listRow(item: ListRow): RemoteViews {
    val views = RemoteViews(context.packageName, R.layout.hw_list_row)
    val ticked = item.id in waiting
    views.setTextViewText(R.id.hw_row_name, item.name)
    views.setTextViewText(R.id.hw_row_flag, item.flag)
    views.setTextViewText(R.id.hw_row_detail, item.detail)
    views.setViewVisibility(R.id.hw_row_flag, if (item.flag.isEmpty() || ticked) View.GONE else View.VISIBLE)
    views.setViewVisibility(R.id.hw_row_detail, if (item.detail.isEmpty()) View.GONE else View.VISIBLE)
    views.setImageViewResource(R.id.hw_check_bg, if (ticked) R.drawable.hw_circle else R.drawable.hw_ring)
    views.setViewVisibility(R.id.hw_check_mark, if (ticked) View.VISIBLE else View.GONE)
    views.setInt(
      R.id.hw_row_name,
      "setPaintFlags",
      Paint.ANTI_ALIAS_FLAG or Paint.SUBPIXEL_TEXT_FLAG or (if (ticked) Paint.STRIKE_THRU_TEXT_FLAG else 0),
    )
    painter.tint(views, R.id.hw_check_bg) { if (ticked) it.fill else it.muted }
    painter.tint(views, R.id.hw_check_mark) { it.onFill }
    painter.text(views, R.id.hw_row_name) { if (ticked) it.muted else it.ink }
    painter.text(views, R.id.hw_row_flag) { it.urgent }
    painter.text(views, R.id.hw_row_detail) { it.muted }
    views.setOnClickFillInIntent(R.id.hw_row, tap(item.id))
    return views
  }

  private fun pinTile(item: PinTile): RemoteViews {
    val views = RemoteViews(context.packageName, R.layout.hw_pin_tile)
    val onList = item.onList || item.id in waiting
    views.setTextViewText(R.id.hw_row_name, item.name)
    views.setTextViewText(R.id.hw_tile_glyph, item.glyph)
    views.setViewVisibility(R.id.hw_tile_glyph, if (onList) View.INVISIBLE else View.VISIBLE)
    views.setViewVisibility(R.id.hw_tile_check, if (onList) View.VISIBLE else View.GONE)
    // On the list: a filled tile with a tick, like a pressed button.
    painter.fill(views, R.id.hw_tile_bg, if (onList) 1f else painter.surfaceAlpha) {
      if (onList) it.fill else it.surface
    }
    painter.tint(views, R.id.hw_tile_check) { it.onFill }
    painter.text(views, R.id.hw_tile_glyph) { it.accent }
    painter.text(views, R.id.hw_row_name) { if (onList) it.onFill else it.ink }
    views.setOnClickFillInIntent(R.id.hw_row, tap(item.id))
    return views
  }

  private fun pulseRow(item: PulseRow): RemoteViews {
    val views = RemoteViews(context.packageName, R.layout.hw_pulse_row)
    views.setTextViewText(R.id.hw_avatar_text, item.initial)
    views.setInt(R.id.hw_avatar_bg, "setColorFilter", item.color)
    views.setTextViewText(R.id.hw_row_name, item.text)
    views.setTextViewText(R.id.hw_row_detail, whenLabel(item.at))
    painter.text(views, R.id.hw_row_name) { it.ink }
    painter.text(views, R.id.hw_row_detail) { it.muted }
    // Nothing to add: the shared click opens the app.
    views.setOnClickFillInIntent(R.id.hw_row, Intent())
    return views
  }

  /**
   * The time of day for today, the date before that. A clock time stays true
   * however long the widget goes without an update; "5 minutes ago" would not.
   */
  private fun whenLabel(at: Long): String {
    if (at <= 0L) return ""
    return if (DateUtils.isToday(at)) {
      DateFormat.getTimeFormat(context).format(Date(at))
    } else {
      DateUtils.formatDateTime(context, at, DateUtils.FORMAT_SHOW_DATE or DateUtils.FORMAT_ABBREV_MONTH or DateUtils.FORMAT_NO_YEAR)
    }
  }

  private fun tap(target: String): Intent =
    Intent().putExtra(WidgetRenderer.EXTRA_KIND, kind.key).putExtra(WidgetRenderer.EXTRA_TARGET, target)

  /** Shown for an instant while a row is fetched: an empty row, not "Loading…". */
  override fun getLoadingView(): RemoteViews = RemoteViews(context.packageName, R.layout.hw_blank)

  override fun getViewTypeCount(): Int = 1

  override fun getItemId(position: Int): Long {
    val data = snapshot ?: return position.toLong()
    val id = when (kind) {
      WidgetKind.LIST -> data.list.items.getOrNull(position)?.id
      WidgetKind.PINS -> data.pins.items.getOrNull(position)?.id
      WidgetKind.PULSE -> data.pulse.items.getOrNull(position)?.id
      WidgetKind.BUDGET -> null
    }
    return id?.hashCode()?.toLong() ?: position.toLong()
  }

  override fun hasStableIds(): Boolean = true
}
