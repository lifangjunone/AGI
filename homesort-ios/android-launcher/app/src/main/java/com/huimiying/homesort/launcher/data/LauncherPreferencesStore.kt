package com.huimiying.homesort.launcher.data

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.huimiying.homesort.launcher.model.LaunchEvent
import com.huimiying.homesort.launcher.model.LaunchSource
import com.huimiying.homesort.launcher.model.LauncherPreferences
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.json.Json

private val Context.launcherDataStore by preferencesDataStore(name = "launcher_memory")

class LauncherPreferencesStore(private val context: Context) {
    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
    }

    private val eventsKey = stringPreferencesKey("launch_events_v1")
    private val hiddenKey = stringPreferencesKey("hidden_packages_v1")
    private val pinnedKey = stringPreferencesKey("pinned_packages_v1")
    private val maximumEvents = 5_000

    val preferences: Flow<LauncherPreferences> = context.launcherDataStore.data.map { values ->
        LauncherPreferences(
            launchEvents = decodeEvents(values[eventsKey]),
            hiddenPackages = decodeStrings(values[hiddenKey]).toSet(),
            pinnedPackages = decodeStrings(values[pinnedKey]),
        )
    }

    suspend fun recordLaunch(packageName: String, timestampMillis: Long = System.currentTimeMillis()) {
        context.launcherDataStore.edit { values ->
            val updated = (
                decodeEvents(values[eventsKey]) +
                    LaunchEvent(packageName, timestampMillis, LaunchSource.HOME_SORT)
                ).takeLast(maximumEvents)
            values[eventsKey] = json.encodeToString(ListSerializer(LaunchEvent.serializer()), updated)
        }
    }

    suspend fun toggleHidden(packageName: String) {
        context.launcherDataStore.edit { values ->
            val hidden = decodeStrings(values[hiddenKey]).toMutableSet()
            if (!hidden.add(packageName)) hidden.remove(packageName)
            values[hiddenKey] = encodeStrings(hidden.sorted())
        }
    }

    suspend fun togglePinned(packageName: String) {
        context.launcherDataStore.edit { values ->
            val pinned = decodeStrings(values[pinnedKey]).toMutableList()
            if (packageName in pinned) {
                pinned.remove(packageName)
            } else {
                pinned.add(packageName)
            }
            values[pinnedKey] = encodeStrings(pinned.take(8))
        }
    }

    suspend fun clearMemory() {
        context.launcherDataStore.edit { values ->
            values.remove(eventsKey)
        }
    }

    suspend fun restoreHiddenApps() {
        context.launcherDataStore.edit { values ->
            values.remove(hiddenKey)
        }
    }

    private fun decodeEvents(raw: String?): List<LaunchEvent> =
        runCatching {
            json.decodeFromString(ListSerializer(LaunchEvent.serializer()), raw.orEmpty())
        }.getOrDefault(emptyList())

    private fun decodeStrings(raw: String?): List<String> =
        runCatching {
            json.decodeFromString(ListSerializer(String.serializer()), raw.orEmpty())
        }.getOrDefault(emptyList())

    private fun encodeStrings(values: List<String>): String =
        json.encodeToString(ListSerializer(String.serializer()), values)
}
