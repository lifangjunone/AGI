package com.huimiying.homesort.launcher.model

import kotlinx.serialization.Serializable

data class LaunchableApp(
    val packageName: String,
    val label: String,
)

@Serializable
data class LaunchEvent(
    val packageName: String,
    val timestampMillis: Long,
    val source: LaunchSource,
)

@Serializable
enum class LaunchSource {
    HOME_SORT,
    SYSTEM_USAGE,
}

data class Prediction(
    val app: LaunchableApp,
    val score: Double,
    val reason: String,
)

data class LauncherPreferences(
    val launchEvents: List<LaunchEvent> = emptyList(),
    val hiddenPackages: Set<String> = emptySet(),
    val pinnedPackages: List<String> = emptyList(),
)
