package expo.modules.homewidgets

import android.app.job.JobInfo
import android.app.job.JobParameters
import android.app.job.JobScheduler
import android.app.job.JobService
import android.content.ComponentName
import android.content.Context
import android.os.Build
import android.os.PersistableBundle
import com.facebook.react.ReactApplication
import com.facebook.react.ReactInstanceEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactContext
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.jstasks.HeadlessJsTaskConfig
import com.facebook.react.jstasks.HeadlessJsTaskContext
import com.facebook.react.jstasks.HeadlessJsTaskEventListener
import java.lang.ref.WeakReference
import java.util.concurrent.ConcurrentHashMap

/**
 * Asks Android to run the app's sync code (TypeScript, see
 * features/widgets/sync.ts) while the app is closed. Android decides the exact
 * moment: at once for a tap, and only with a connection.
 */
internal object WidgetSync {
  /** Taps waiting to be sent. */
  const val REASON_ACTIONS = "actions"
  /** Newer data for widgets that only show things. */
  const val REASON_REFRESH = "refresh"
  const val EXTRA_REASON = "reason"

  private const val JOB_ACTIONS = 58201
  private const val JOB_REFRESH = 58202
  /** The widgets redraw every 30 minutes; this stops several of them asking at once. */
  private const val MIN_REFRESH_GAP_MS = 10 * 60_000L

  /** What the app's code said about each run: true = try again later. */
  val results = ConcurrentHashMap<String, Boolean>()

  @Volatile var actionsRunning = false
  /** A tap arrived while a run was under way: run once more after it. */
  @Volatile var actionsAgain = false

  fun requestActions(context: Context) {
    if (actionsRunning) {
      // Scheduling the same job again would stop the run in progress.
      actionsAgain = true
      return
    }
    schedule(context, JOB_ACTIONS, REASON_ACTIONS, urgent = true)
  }

  fun requestRefresh(context: Context) {
    if (!WidgetStore.backgroundSync(context)) return
    // Signed out, or never opened: nothing to fetch.
    if (WidgetStore.snapshot(context)?.ready != true) return
    val now = System.currentTimeMillis()
    val last = WidgetStore.lastRefreshAt(context)
    if (now >= last && now - last < MIN_REFRESH_GAP_MS) return
    WidgetStore.setLastRefreshAt(context, now)
    schedule(context, JOB_REFRESH, REASON_REFRESH, urgent = false)
  }

  private fun schedule(context: Context, jobId: Int, reason: String, urgent: Boolean) {
    val scheduler = context.getSystemService(JobScheduler::class.java) ?: return
    val extras = PersistableBundle().apply { putString(EXTRA_REASON, reason) }
    val job = JobInfo.Builder(jobId, ComponentName(context, WidgetSyncJobService::class.java))
      .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
      .setExtras(extras)
    // Android 12+: start now rather than when the phone finds a quiet moment.
    if (urgent && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) job.setExpedited(true)
    try {
      scheduler.schedule(job.build())
    } catch (_: Exception) {
      // The tap stays stored and is sent the next time the app opens.
    }
  }
}

/**
 * Runs the app's JavaScript without showing the app ("headless"). It starts
 * the JavaScript engine if the app is not already in memory, calls the task
 * named [TASK] and waits until that task says it has finished.
 */
class WidgetSyncJobService : JobService() {
  private val running = ConcurrentHashMap<Int, JobParameters>()
  private var tasks: WeakReference<HeadlessJsTaskContext>? = null

  private val listener = object : HeadlessJsTaskEventListener {
    override fun onHeadlessJsTaskStart(taskId: Int) = Unit

    override fun onHeadlessJsTaskFinish(taskId: Int) {
      val params = running.remove(taskId) ?: return
      val reason = reasonOf(params)
      // No answer (the task timed out): retry only if taps are still waiting.
      val retry = WidgetSync.results.remove(reason)
        ?: (reason == WidgetSync.REASON_ACTIONS && WidgetStore.pending(this@WidgetSyncJobService).isNotEmpty())
      finish(params, retry)
    }
  }

  override fun onStartJob(params: JobParameters): Boolean {
    val reason = reasonOf(params)
    val host = (application as? ReactApplication)?.reactHost ?: return false
    if (reason == WidgetSync.REASON_ACTIONS) WidgetSync.actionsRunning = true
    WidgetSync.results.remove(reason)

    val context = host.currentReactContext
    if (context != null) {
      startTask(context, params)
    } else {
      // The app is not in memory: start its JavaScript, then run the task.
      host.addReactInstanceEventListener(
        object : ReactInstanceEventListener {
          override fun onReactContextInitialized(context: ReactContext) {
            host.removeReactInstanceEventListener(this)
            UiThreadUtil.runOnUiThread { startTask(context, params) }
          }
        },
      )
      host.start()
    }
    // True: the work continues after this method returns.
    return true
  }

  private fun startTask(context: ReactContext, params: JobParameters) {
    try {
      val taskContext = HeadlessJsTaskContext.getInstance(context)
      tasks = WeakReference(taskContext)
      taskContext.addTaskEventListener(listener)
      val data = Arguments.createMap().apply { putString(WidgetSync.EXTRA_REASON, reasonOf(params)) }
      // Allowed while the app is on screen too: a widget can be tapped right after leaving it.
      val taskId = taskContext.startTask(HeadlessJsTaskConfig(TASK, data, TIMEOUT_MS, true))
      running[taskId] = params
    } catch (_: Throwable) {
      finish(params, retry = false)
    }
  }

  private fun finish(params: JobParameters, retry: Boolean) {
    if (running.isEmpty()) tasks?.get()?.removeTaskEventListener(listener)
    if (reasonOf(params) != WidgetSync.REASON_ACTIONS) {
      // A missed refresh is not retried: the next one is at most 30 minutes away.
      jobFinished(params, false)
      return
    }
    WidgetSync.actionsRunning = false
    val again = WidgetSync.actionsAgain
    WidgetSync.actionsAgain = false
    jobFinished(params, retry && !again)
    if (again) WidgetSync.requestActions(this)
  }

  /** Android is taking the time back (no connection any more, or it ran too long). */
  override fun onStopJob(params: JobParameters): Boolean {
    running.values.removeAll { it.jobId == params.jobId }
    if (reasonOf(params) != WidgetSync.REASON_ACTIONS) return false
    WidgetSync.actionsRunning = false
    WidgetSync.actionsAgain = false
    // True: run again later, while taps are still waiting.
    return WidgetStore.pending(this).isNotEmpty()
  }

  override fun onDestroy() {
    tasks?.get()?.removeTaskEventListener(listener)
    super.onDestroy()
  }

  private fun reasonOf(params: JobParameters): String =
    params.extras.getString(WidgetSync.EXTRA_REASON) ?: WidgetSync.REASON_REFRESH

  companion object {
    /** Registered in features/widgets/headless-task.ts. */
    const val TASK = "OmtWidgetSync"
    /** The task is cut off after this long, so a hung request cannot keep the phone awake. */
    private const val TIMEOUT_MS = 90_000L
  }
}
