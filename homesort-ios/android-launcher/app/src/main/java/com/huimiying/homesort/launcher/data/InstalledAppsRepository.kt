package com.huimiying.homesort.launcher.data

import android.app.AppOpsManager
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Process
import com.huimiying.homesort.launcher.model.LaunchEvent
import com.huimiying.homesort.launcher.model.LaunchSource
import com.huimiying.homesort.launcher.model.LaunchableApp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class InstalledAppsRepository(private val context: Context) {
    private val packageManager = context.packageManager

    suspend fun loadLaunchableApps(): List<LaunchableApp> = withContext(Dispatchers.IO) {
        val intent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
        val resolved = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            packageManager.queryIntentActivities(
                intent,
                PackageManager.ResolveInfoFlags.of(PackageManager.MATCH_ALL.toLong()),
            )
        } else {
            @Suppress("DEPRECATION")
            packageManager.queryIntentActivities(intent, PackageManager.MATCH_ALL)
        }

        resolved.asSequence()
            .map { info ->
                LaunchableApp(
                    packageName = info.activityInfo.packageName,
                    label = info.loadLabel(packageManager).toString(),
                )
            }
            .filter { it.packageName != context.packageName }
            .distinctBy { it.packageName }
            .sortedBy { it.label.lowercase() }
            .toList()
    }

    fun hasUsageAccess(): Boolean {
        val appOps = context.getSystemService(AppOpsManager::class.java)
        val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            appOps.unsafeCheckOpNoThrow(
                AppOpsManager.OPSTR_GET_USAGE_STATS,
                Process.myUid(),
                context.packageName,
            )
        } else {
            @Suppress("DEPRECATION")
            appOps.checkOpNoThrow(
                AppOpsManager.OPSTR_GET_USAGE_STATS,
                Process.myUid(),
                context.packageName,
            )
        }
        return mode == AppOpsManager.MODE_ALLOWED
    }

    suspend fun loadSystemUsageEvents(
        knownPackages: Set<String>,
        nowMillis: Long = System.currentTimeMillis(),
    ): List<LaunchEvent> = withContext(Dispatchers.IO) {
        if (!hasUsageAccess()) return@withContext emptyList()

        val usageStats = context.getSystemService(UsageStatsManager::class.java)
        val events = usageStats.queryEvents(nowMillis - HISTORY_WINDOW_MILLIS, nowMillis)
        val event = UsageEvents.Event()
        val result = ArrayList<LaunchEvent>()

        while (events.hasNextEvent()) {
            events.getNextEvent(event)
            val isForeground = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                event.eventType == UsageEvents.Event.ACTIVITY_RESUMED
            } else {
                @Suppress("DEPRECATION")
                event.eventType == UsageEvents.Event.MOVE_TO_FOREGROUND
            }
            if (isForeground && event.packageName in knownPackages) {
                result += LaunchEvent(
                    packageName = event.packageName,
                    timestampMillis = event.timeStamp,
                    source = LaunchSource.SYSTEM_USAGE,
                )
            }
        }
        result.takeLast(MAXIMUM_USAGE_EVENTS)
    }

    fun launchIntent(packageName: String): Intent? =
        packageManager.getLaunchIntentForPackage(packageName)?.apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED)
        }

    companion object {
        private const val HISTORY_WINDOW_MILLIS = 14L * 24 * 60 * 60 * 1_000
        private const val MAXIMUM_USAGE_EVENTS = 10_000
    }
}
