package com.huimiying.homesort.launcher.prediction

import com.huimiying.homesort.launcher.model.LaunchEvent
import com.huimiying.homesort.launcher.model.LaunchSource
import com.huimiying.homesort.launcher.model.LaunchableApp
import java.time.ZoneId
import java.time.ZonedDateTime
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class PredictionEngineTest {
    private val zone = ZoneId.of("Asia/Shanghai")
    private val now = ZonedDateTime.of(2026, 9, 29, 9, 0, 0, 0, zone)
    private val apps = listOf(
        LaunchableApp("com.example.mail", "邮件"),
        LaunchableApp("com.example.chat", "沟通"),
        LaunchableApp("com.example.maps", "地图"),
    )

    @Test
    fun pinnedAppRanksFirstWithoutHistory() {
        val ranked = PredictionEngine.rank(
            apps = apps,
            localEvents = emptyList(),
            systemEvents = emptyList(),
            pinnedPackages = listOf("com.example.maps"),
            nowMillis = now.toInstant().toEpochMilli(),
            zoneId = zone,
        )

        assertEquals("com.example.maps", ranked.first().app.packageName)
        assertEquals("固定入口", ranked.first().reason)
    }

    @Test
    fun repeatedSameHourUsageOutranksAlphabeticalFallback() {
        val events = listOf(
            event("com.example.mail", now.minusDays(1).withHour(9)),
            event("com.example.mail", now.minusDays(2).withHour(9)),
            event("com.example.mail", now.minusDays(3).withHour(9)),
        )

        val ranked = PredictionEngine.rank(
            apps = apps,
            localEvents = events,
            systemEvents = emptyList(),
            pinnedPackages = emptyList(),
            nowMillis = now.toInstant().toEpochMilli(),
            zoneId = zone,
        )

        assertEquals("com.example.mail", ranked.first().app.packageName)
        assertEquals("常在这个时间使用", ranked.first().reason)
    }

    @Test
    fun systemUsageAndHomeSortEventsBothContribute() {
        val local = listOf(event("com.example.chat", now.minusHours(1)))
        val system = List(5) { index ->
            event("com.example.maps", now.minusHours(index.toLong() + 1))
        }

        val ranked = PredictionEngine.rank(
            apps = apps,
            localEvents = local,
            systemEvents = system,
            pinnedPackages = emptyList(),
            nowMillis = now.toInstant().toEpochMilli(),
            zoneId = zone,
        )

        assertEquals("com.example.maps", ranked.first().app.packageName)
        assertTrue(ranked.first().score > ranked.last().score)
    }

    @Test
    fun noHistoryUsesStableLabelOrder() {
        val ranked = PredictionEngine.rank(
            apps = apps.reversed(),
            localEvents = emptyList(),
            systemEvents = emptyList(),
            pinnedPackages = emptyList(),
            nowMillis = now.toInstant().toEpochMilli(),
            zoneId = zone,
        )

        assertEquals(listOf("地图", "沟通", "邮件"), ranked.map { it.app.label })
    }

    private fun event(packageName: String, date: ZonedDateTime) = LaunchEvent(
        packageName = packageName,
        timestampMillis = date.toInstant().toEpochMilli(),
        source = LaunchSource.HOME_SORT,
    )
}
