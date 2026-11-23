package expo.modules.homewidgets

import android.graphics.Color
import org.json.JSONArray
import org.json.JSONObject

/** Every colour a widget paints with, for one theme (light or dark). */
internal class Palette(
  val bg: Int,
  val surface: Int,
  val ink: Int,
  val muted: Int,
  val accent: Int,
  val fill: Int,
  val onFill: Int,
  val urgent: Int,
  val warn: Int,
  val danger: Int,
  val track: Int,
) {
  companion object {
    val DARK = Palette(
      bg = 0xFF14171C.toInt(), surface = 0xFF1F2630.toInt(), ink = 0xFFECEEF1.toInt(),
      muted = 0xFF9AA7BD.toInt(), accent = 0xFF5CB3FA.toInt(), fill = 0xFF2196F3.toInt(),
      onFill = 0xFFFFFFFF.toInt(), urgent = 0xFFFF8A5E.toInt(),
      warn = 0xFFE6B450.toInt(), danger = 0xFFF07178.toInt(), track = 0xFF2A313A.toInt(),
    )
    val LIGHT = Palette(
      bg = 0xFFFFFFFF.toInt(), surface = 0xFFEAF3FD.toInt(), ink = 0xFF0B3B66.toInt(),
      muted = 0xFF2D6CA8.toInt(), accent = 0xFF2196F3.toInt(), fill = 0xFF2196F3.toInt(),
      onFill = 0xFFFFFFFF.toInt(), urgent = 0xFFD9480F.toInt(),
      warn = 0xFFB7791F.toInt(), danger = 0xFFC2414A.toInt(), track = 0xFFDDE8F3.toInt(),
    )

    fun from(json: JSONObject?, fallback: Palette): Palette {
      if (json == null) return fallback
      fun color(key: String, otherwise: Int) = parseColor(json.optString(key), otherwise)
      return Palette(
        bg = color("bg", fallback.bg),
        surface = color("surface", fallback.surface),
        ink = color("ink", fallback.ink),
        muted = color("muted", fallback.muted),
        accent = color("accent", fallback.accent),
        fill = color("fill", fallback.fill),
        onFill = color("onFill", fallback.onFill),
        urgent = color("urgent", fallback.urgent),
        warn = color("warn", fallback.warn),
        danger = color("danger", fallback.danger),
        track = color("track", fallback.track),
      )
    }
  }
}

/**
 * Glass widgets: how solid (0–1) the background, the tiles on it and the
 * budget ring's track are drawn. Sent apart from the colours, which stay
 * opaque (see parseColor).
 */
internal class Glass(json: JSONObject) {
  val bg: Float = alpha(json, "bg")
  val surface: Float = alpha(json, "surface")
  val track: Float = alpha(json, "track")

  private fun alpha(json: JSONObject, key: String): Float =
    json.optDouble(key, 1.0).let { if (it.isNaN()) 1.0 else it }.toFloat().coerceIn(0f, 1f)
}

internal fun parseColor(value: String?, otherwise: Int): Int {
  if (value.isNullOrEmpty()) return otherwise
  return try {
    // Always opaque: a see-through colour would let the white shape show.
    Color.parseColor(value) or 0xFF000000.toInt()
  } catch (_: IllegalArgumentException) {
    otherwise
  }
}

internal class ListRow(val id: String, val name: String, val flag: String, val detail: String)

internal class PinTile(val id: String, val name: String, val glyph: String, val onList: Boolean)

internal class PulseRow(val id: String, val initial: String, val color: Int, val text: String, val at: Long)

/** A header and its scrolling rows, plus what to say when there are none. */
internal class Section<T>(json: JSONObject?, read: (JSONObject) -> T?) {
  val title: String = json?.optString("title").orEmpty()
  val subtitle: String = json?.optString("subtitle").orEmpty()
  val emptyTitle: String = json?.optString("emptyTitle").orEmpty()
  val emptyBody: String = json?.optString("emptyBody").orEmpty()
  val items: List<T> = readItems(json?.optJSONArray("items"), read)

  private fun readItems(array: JSONArray?, read: (JSONObject) -> T?): List<T> {
    if (array == null) return emptyList()
    val out = ArrayList<T>(array.length())
    for (index in 0 until array.length()) {
      val row = array.optJSONObject(index) ?: continue
      read(row)?.let(out::add)
    }
    return out
  }
}

internal class Budget(json: JSONObject?) {
  /** "ring": the numbers below. "message": title and body only (costs are off). */
  val showRing: Boolean = json?.optString("mode") == "ring"
  val title: String = json?.optString("title").orEmpty()
  val body: String = json?.optString("body").orEmpty()
  val fraction: Float = (json?.optDouble("fraction", 0.0) ?: 0.0).let { if (it.isNaN()) 0.0 else it }.toFloat()
  /** "accent", "warn" or "danger". */
  val tone: String = json?.optString("tone").orEmpty()
  val center: String = json?.optString("center").orEmpty()
  val centerSub: String = json?.optString("centerSub").orEmpty()
  val line1: String = json?.optString("line1").orEmpty()
  val line2: String = json?.optString("line2").orEmpty()
}

/**
 * Everything the widgets show, written by the app as one JSON text. The app
 * decides the wording, the language and the colours; this side only draws.
 */
internal class Snapshot(json: JSONObject) {
  /** "ready", or a state where only a message shows (signed out, no home). */
  val ready: Boolean = json.optString("state") == "ready"
  val rtl: Boolean = json.optBoolean("rtl", false)
  /** "light", "dark" or "system" (follow the phone). */
  val themeMode: String = json.optString("themeMode", "system")
  val light: Palette = Palette.from(json.optJSONObject("light"), Palette.LIGHT)
  val dark: Palette = Palette.from(json.optJSONObject("dark"), Palette.DARK)
  /** Null: ordinary widgets, every shape solid. */
  val glass: Glass? = json.optJSONObject("glass")?.let(::Glass)
  val messageTitle: String = json.optString("messageTitle")
  val messageBody: String = json.optString("messageBody")

  val list = Section(json.optJSONObject("list")) { row ->
    val id = row.optString("id")
    if (id.isEmpty()) null
    else ListRow(id, row.optString("name"), row.optString("flag"), row.optString("detail"))
  }
  val pins = Section(json.optJSONObject("pins")) { row ->
    val id = row.optString("id")
    if (id.isEmpty()) null
    else PinTile(id, row.optString("name"), row.optString("glyph"), row.optBoolean("onList", false))
  }
  val pulse = Section(json.optJSONObject("pulse")) { row ->
    val id = row.optString("id")
    if (id.isEmpty()) null
    else PulseRow(
      id,
      row.optString("initial"),
      parseColor(row.optString("color"), Palette.DARK.fill),
      row.optString("text"),
      row.optLong("at", 0L),
    )
  }
  val budget = Budget(json.optJSONObject("budget"))
}
