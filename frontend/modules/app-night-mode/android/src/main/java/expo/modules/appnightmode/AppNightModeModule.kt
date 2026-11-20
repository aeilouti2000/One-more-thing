package expo.modules.appnightmode

import android.app.UiModeManager
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Android draws the launch splash before any app code runs, using the night
 * mode it has on record for the app. Without this it only knows the phone's
 * setting, so a light app on a dark phone opens on the dark splash.
 * Android 12+ remembers this value across launches.
 */
class AppNightModeModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("AppNightMode")

    Function("setNightMode") { mode: String ->
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return@Function
      val context = appContext.reactContext ?: return@Function
      val uiModeManager = context.getSystemService(UiModeManager::class.java) ?: return@Function
      val next = when (mode) {
        "dark" -> UiModeManager.MODE_NIGHT_YES
        "light" -> UiModeManager.MODE_NIGHT_NO
        else -> UiModeManager.MODE_NIGHT_AUTO
      }
      uiModeManager.setApplicationNightMode(next)
    }
  }
}
