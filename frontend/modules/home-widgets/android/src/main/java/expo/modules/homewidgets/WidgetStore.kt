package expo.modules.homewidgets

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

/** A tap made on a widget that the server has not heard about yet. */
internal class PendingAction(val id: String, val type: String, val target: String, val at: Long) {
  fun toJson(): JSONObject =
    JSONObject().put("id", id).put("type", type).put("target", target).put("at", at)

  companion object {
    /** Marking a list item as bought. */
    const val BUY = "buy"
    /** Putting a pinned item on the list. */
    const val PIN = "pin"
  }
}

/**
 * What the widgets keep on the phone: the last data the app handed over, and
 * the taps still waiting to be sent. Private to this app.
 */
internal object WidgetStore {
  private const val PREFS = "omt.home-widgets"
  private const val KEY_SNAPSHOT = "snapshot"
  private const val KEY_PENDING = "pending"
  private const val KEY_BACKGROUND = "backgroundSync"
  private const val KEY_LAST_REFRESH = "lastRefreshAt"

  private val lock = Any()
  private var parsedFrom: String? = null
  private var parsed: Snapshot? = null

  private fun prefs(context: Context): SharedPreferences =
    context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  fun snapshot(context: Context): Snapshot? = synchronized(lock) {
    val raw = prefs(context).getString(KEY_SNAPSHOT, null) ?: return null
    if (raw != parsedFrom) {
      parsed = try {
        Snapshot(JSONObject(raw))
      } catch (_: Exception) {
        null
      }
      parsedFrom = raw
    }
    parsed
  }

  /** False when it is the data already stored: nothing to redraw. */
  fun setSnapshot(context: Context, raw: String): Boolean = synchronized(lock) {
    val store = prefs(context)
    if (store.getString(KEY_SNAPSHOT, null) == raw) return false
    store.edit().putString(KEY_SNAPSHOT, raw).apply()
    true
  }

  fun pending(context: Context): List<PendingAction> = synchronized(lock) { readPending(context) }

  fun pendingJson(context: Context): String = synchronized(lock) {
    prefs(context).getString(KEY_PENDING, null) ?: "[]"
  }

  /**
   * A tap on a list row: marks it bought, or takes that back when the first
   * tap has not been sent yet. Returns true when a tap is now waiting.
   */
  fun toggle(context: Context, type: String, target: String): Boolean = synchronized(lock) {
    val current = readPending(context)
    val existing = current.filter { it.type == type && it.target == target }
    if (existing.isNotEmpty()) {
      writePending(context, current - existing.toSet())
      false
    } else {
      writePending(context, current + newAction(type, target))
      true
    }
  }

  /** Adds the tap unless the same one is already waiting. */
  fun addOnce(context: Context, type: String, target: String): Boolean = synchronized(lock) {
    val current = readPending(context)
    if (current.any { it.type == type && it.target == target }) return false
    writePending(context, current + newAction(type, target))
    true
  }

  /** True when something was removed. */
  fun complete(context: Context, ids: Collection<String>): Boolean = synchronized(lock) {
    val current = readPending(context)
    val left = current.filterNot { it.id in ids }
    if (left.size == current.size) return false
    writePending(context, left)
    true
  }

  fun clearPending(context: Context): Boolean = synchronized(lock) {
    if (readPending(context).isEmpty()) return false
    writePending(context, emptyList())
    true
  }

  fun backgroundSync(context: Context): Boolean = prefs(context).getBoolean(KEY_BACKGROUND, true)

  fun setBackgroundSync(context: Context, enabled: Boolean) {
    prefs(context).edit().putBoolean(KEY_BACKGROUND, enabled).apply()
  }

  fun lastRefreshAt(context: Context): Long = prefs(context).getLong(KEY_LAST_REFRESH, 0L)

  fun setLastRefreshAt(context: Context, at: Long) {
    prefs(context).edit().putLong(KEY_LAST_REFRESH, at).apply()
  }

  private fun newAction(type: String, target: String) =
    PendingAction(UUID.randomUUID().toString(), type, target, System.currentTimeMillis())

  private fun readPending(context: Context): List<PendingAction> {
    val raw = prefs(context).getString(KEY_PENDING, null) ?: return emptyList()
    return try {
      val array = JSONArray(raw)
      val out = ArrayList<PendingAction>(array.length())
      for (index in 0 until array.length()) {
        val row = array.optJSONObject(index) ?: continue
        val id = row.optString("id")
        val type = row.optString("type")
        val target = row.optString("target")
        if (id.isEmpty() || type.isEmpty() || target.isEmpty()) continue
        out.add(PendingAction(id, type, target, row.optLong("at", 0L)))
      }
      out
    } catch (_: Exception) {
      emptyList()
    }
  }

  private fun writePending(context: Context, actions: List<PendingAction>) {
    val array = JSONArray()
    for (action in actions) array.put(action.toJson())
    prefs(context).edit().putString(KEY_PENDING, array.toString()).apply()
  }
}
