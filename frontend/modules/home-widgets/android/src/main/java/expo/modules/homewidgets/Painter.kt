package expo.modules.homewidgets

import android.content.Context
import android.content.res.Configuration
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.drawable.Icon
import android.os.Build
import android.widget.RemoteViews
import kotlin.math.roundToInt

/**
 * Colours a widget. When the app follows the phone's theme, Android 12+ is
 * given both the light and the dark colour for every view, so the widget
 * changes with the phone by itself. Otherwise one theme is painted.
 */
internal class Painter(context: Context, snapshot: Snapshot?) {
  private val light = snapshot?.light ?: Palette.LIGHT
  private val dark = snapshot?.dark ?: Palette.DARK
  private val mode = snapshot?.themeMode ?: "system"
  private val both = mode == "system" && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
  private val one: Palette = when (mode) {
    "dark" -> dark
    "light" -> light
    else -> {
      val night = context.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK
      if (night == Configuration.UI_MODE_NIGHT_YES) dark else light
    }
  }

  private val glass = snapshot?.glass
  /** A glass widget: see-through, with a bright rim. */
  val isGlass: Boolean = glass != null
  /** How solid (0–1) each see-through part is; 1 on ordinary widgets. */
  val bgAlpha: Float = glass?.bg ?: 1f
  val surfaceAlpha: Float = glass?.surface ?: 1f
  val trackAlpha: Float = glass?.track ?: 1f

  fun text(views: RemoteViews, viewId: Int, pick: (Palette) -> Int) {
    if (both && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      views.setColorInt(viewId, "setTextColor", pick(light), pick(dark))
    } else {
      views.setTextColor(viewId, pick(one))
    }
  }

  /** Recolours a white shape or icon (an ImageView). */
  fun tint(views: RemoteViews, viewId: Int, pick: (Palette) -> Int) {
    if (both && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      views.setColorInt(viewId, "setColorFilter", pick(light), pick(dark))
    } else {
      views.setInt(viewId, "setColorFilter", pick(one))
    }
  }

  /**
   * Recolours a white shape and sets how solid it is. The colour filter
   * replaces the white entirely, so the see-through part has to be the
   * image's own alpha. Always set: list rows are reused.
   */
  fun fill(views: RemoteViews, viewId: Int, alpha: Float, pick: (Palette) -> Int) {
    tint(views, viewId, pick)
    views.setInt(viewId, "setImageAlpha", (alpha.coerceIn(0f, 1f) * 255).roundToInt())
  }

  fun image(views: RemoteViews, viewId: Int, draw: (Palette) -> Bitmap) {
    if (both && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      views.setIcon(
        viewId,
        "setImageIcon",
        Icon.createWithBitmap(draw(light)),
        Icon.createWithBitmap(draw(dark)),
      )
    } else {
      views.setImageViewBitmap(viewId, draw(one))
    }
  }
}

/** The same colour, `alpha` (0–1) solid. */
internal fun withAlpha(color: Int, alpha: Float): Int =
  (color and 0x00FFFFFF) or ((alpha.coerceIn(0f, 1f) * 255).roundToInt() shl 24)

/** The budget ring: a grey track with the used part drawn over it from the top. */
internal fun drawRing(context: Context, fraction: Float, color: Int, track: Int): Bitmap {
  val density = context.resources.displayMetrics.density
  val size = (80 * density).toInt().coerceAtLeast(1)
  val stroke = 8 * density
  val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
  val canvas = Canvas(bitmap)
  val bounds = RectF(stroke / 2, stroke / 2, size - stroke / 2, size - stroke / 2)
  val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    style = Paint.Style.STROKE
    strokeWidth = stroke
    strokeCap = Paint.Cap.ROUND
  }
  paint.color = track
  canvas.drawOval(bounds, paint)
  val used = fraction.coerceIn(0f, 1f)
  if (used > 0f) {
    paint.color = color
    if (used >= 1f) canvas.drawOval(bounds, paint)
    // A sliver stays visible as a dot rather than vanishing.
    else canvas.drawArc(bounds, -90f, (360f * used).coerceAtLeast(1f), false, paint)
  }
  return bitmap
}
