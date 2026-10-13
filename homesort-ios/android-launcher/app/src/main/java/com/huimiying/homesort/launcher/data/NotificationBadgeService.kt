package com.huimiying.homesort.launcher.data

import android.app.Notification
import android.content.ComponentName
import android.content.Context
import android.provider.Settings
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

class NotificationBadgeService : NotificationListenerService() {
    override fun onListenerConnected() {
        publish(activeNotifications.orEmpty())
    }

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        publish(activeNotifications.orEmpty())
    }

    override fun onNotificationRemoved(sbn: StatusBarNotification?) {
        publish(activeNotifications.orEmpty())
    }

    private fun publish(notifications: Array<out StatusBarNotification>) {
        mutableCounts.value = notifications
            .asSequence()
            .filterNot { it.notification.flags and Notification.FLAG_GROUP_SUMMARY != 0 }
            .groupingBy(StatusBarNotification::getPackageName)
            .fold(0) { count, notification ->
                count + notification.notification.number.coerceAtLeast(1)
            }
    }

    companion object {
        private val mutableCounts = MutableStateFlow<Map<String, Int>>(emptyMap())
        val counts: StateFlow<Map<String, Int>> = mutableCounts.asStateFlow()

        fun isEnabled(context: Context): Boolean {
            val component = ComponentName(context, NotificationBadgeService::class.java)
            return Settings.Secure.getString(
                context.contentResolver,
                "enabled_notification_listeners",
            )?.split(':')?.any { ComponentName.unflattenFromString(it) == component } == true
        }
    }
}
