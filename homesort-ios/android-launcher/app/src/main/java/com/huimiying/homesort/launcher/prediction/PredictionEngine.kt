package com.huimiying.homesort.launcher.prediction

import com.huimiying.homesort.launcher.model.LaunchEvent
import com.huimiying.homesort.launcher.model.LaunchableApp
import com.huimiying.homesort.launcher.model.Prediction
import java.time.Instant
import java.time.ZoneId
import java.time.ZonedDateTime
import kotlin.math.abs
import kotlin.math.exp
import kotlin.math.ln

object PredictionEngine {
    fun rank(
        apps: List<LaunchableApp>,
        localEvents: List<LaunchEvent>,
        systemEvents: List<LaunchEvent>,
        pinnedPackages: List<String>,
        nowMillis: Long = System.currentTimeMillis(),
        zoneId: ZoneId = ZoneId.systemDefault(),
    ): List<Prediction> {
        val now = ZonedDateTime.ofInstant(Instant.ofEpochMilli(nowMillis), zoneId)
        val eventsByPackage = (localEvents + systemEvents).groupBy { it.packageName }
        val pinnedIndex = pinnedPackages.withIndex().associate { it.value to it.index }

        return apps.map { app ->
            val events = eventsByPackage[app.packageName].orEmpty()
            var score = pinnedIndex[app.packageName]?.let { 18.0 - it.coerceAtMost(8) } ?: 0.0
            score += ln(events.size.toDouble() + 1.0) * 2.4

            var matchingHours = 0
            var matchingDays = 0
            events.forEach { event ->
                val eventTime = ZonedDateTime.ofInstant(
                    Instant.ofEpochMilli(event.timestampMillis),
                    zoneId,
                )
                val hourDistance = minOf(
                    abs(eventTime.hour - now.hour),
                    24 - abs(eventTime.hour - now.hour),
                )
                if (hourDistance == 0) {
                    score += 3.2
                    matchingHours += 1
                } else if (hourDistance == 1) {
                    score += 1.4
                    matchingHours += 1
                }

                if (eventTime.dayOfWeek == now.dayOfWeek) {
                    score += 0.8
                    matchingDays += 1
                }

                val ageHours = ((nowMillis - event.timestampMillis).coerceAtLeast(0L)) / 3_600_000.0
                score += 2.6 * exp(-ageHours / 72.0)
            }

            val reason = when {
                pinnedIndex.containsKey(app.packageName) -> "固定入口"
                events.isEmpty() -> "等待真实使用"
                matchingHours >= 2 -> "常在这个时间使用"
                matchingDays >= 2 -> "常在今天使用"
                else -> "近期使用较多"
            }
            Prediction(app = app, score = score, reason = reason)
        }.sortedWith(
            compareByDescending<Prediction> { it.score }
                .thenBy { pinnedIndex[it.app.packageName] ?: Int.MAX_VALUE }
                .thenBy { it.app.label.lowercase() },
        )
    }
}
