package com.huimiying.homesort.launcher

import android.app.Application
import android.content.ActivityNotFoundException
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.huimiying.homesort.launcher.data.InstalledAppsRepository
import com.huimiying.homesort.launcher.data.LauncherPreferencesStore
import com.huimiying.homesort.launcher.data.NotificationBadgeService
import com.huimiying.homesort.launcher.data.WeatherRepository
import com.huimiying.homesort.launcher.model.LaunchEvent
import com.huimiying.homesort.launcher.model.LaunchableApp
import com.huimiying.homesort.launcher.model.LauncherPreferences
import com.huimiying.homesort.launcher.model.Prediction
import com.huimiying.homesort.launcher.model.WeatherContext
import com.huimiying.homesort.launcher.prediction.PredictionEngine
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull

data class LauncherUiState(
    val allApps: List<LaunchableApp> = emptyList(),
    val predictions: List<Prediction> = emptyList(),
    val hiddenPackages: Set<String> = emptySet(),
    val pinnedPackages: List<String> = emptyList(),
    val hasUsageAccess: Boolean = false,
    val hasNotificationAccess: Boolean = false,
    val notificationCounts: Map<String, Int> = emptyMap(),
    val hasLocationPermission: Boolean = false,
    val weather: WeatherContext? = null,
    val isWeatherLoading: Boolean = false,
    val weatherUnavailable: Boolean = false,
    val isLoading: Boolean = true,
    val launchError: String? = null,
)

class LauncherViewModel(application: Application) : AndroidViewModel(application) {
    private val appsRepository = InstalledAppsRepository(application)
    private val preferencesStore = LauncherPreferencesStore(application)
    private val weatherRepository = WeatherRepository(application)
    private val mutableState = MutableStateFlow(LauncherUiState())
    private var preferences = LauncherPreferences()
    private var installedApps = emptyList<LaunchableApp>()
    private var systemEvents = emptyList<LaunchEvent>()

    val state: StateFlow<LauncherUiState> = mutableState.asStateFlow()

    init {
        viewModelScope.launch {
            preferencesStore.preferences.collect {
                preferences = it
                publish()
            }
        }
        viewModelScope.launch {
            NotificationBadgeService.counts.collect {
                publish()
            }
        }
        refresh()
        refreshWeather()
    }

    fun refresh() {
        viewModelScope.launch {
            installedApps = appsRepository.loadLaunchableApps()
            systemEvents = appsRepository.loadSystemUsageEvents(
                knownPackages = installedApps.mapTo(mutableSetOf(), LaunchableApp::packageName),
            )
            publish(isLoading = false)
        }
    }

    fun refreshWeather() {
        val hasPermission = weatherRepository.hasLocationPermission()
        mutableState.value = mutableState.value.copy(
            hasLocationPermission = hasPermission,
            isWeatherLoading = hasPermission,
            weatherUnavailable = false,
        )
        if (!hasPermission) return

        viewModelScope.launch {
            try {
                val weather = withTimeoutOrNull(12_000) {
                    weatherRepository.loadCurrentWeather()
                } ?: error("Location request timed out")
                mutableState.value = mutableState.value.copy(
                    weather = weather,
                    isWeatherLoading = false,
                    weatherUnavailable = false,
                )
            } catch (error: Exception) {
                if (error is CancellationException) throw error
                mutableState.value = mutableState.value.copy(
                    isWeatherLoading = false,
                    weatherUnavailable = true,
                )
            }
        }
    }

    fun launch(app: LaunchableApp) {
        val intent = appsRepository.launchIntent(app.packageName)
        if (intent == null) {
            mutableState.value = mutableState.value.copy(
                launchError = "无法打开 ${app.label}，应用可能已被卸载。",
            )
            return
        }

        viewModelScope.launch {
            preferencesStore.recordLaunch(app.packageName)
        }
        try {
            getApplication<Application>().startActivity(intent)
        } catch (_: ActivityNotFoundException) {
            mutableState.value = mutableState.value.copy(
                launchError = "无法打开 ${app.label}，启动入口已失效。",
            )
        }
    }

    fun togglePinned(packageName: String) {
        viewModelScope.launch {
            preferencesStore.togglePinned(packageName)
        }
    }

    fun toggleHidden(packageName: String) {
        viewModelScope.launch {
            preferencesStore.toggleHidden(packageName)
        }
    }

    fun clearMemory() {
        viewModelScope.launch {
            preferencesStore.clearMemory()
            systemEvents = emptyList()
            publish()
        }
    }

    fun restoreHiddenApps() {
        viewModelScope.launch {
            preferencesStore.restoreHiddenApps()
        }
    }

    fun dismissError() {
        mutableState.value = mutableState.value.copy(launchError = null)
    }

    private fun publish(isLoading: Boolean = mutableState.value.isLoading) {
        val visibleApps = installedApps.filterNot { it.packageName in preferences.hiddenPackages }
        val predictableApps = visibleApps.filterNot {
            it.packageName in NON_PREDICTIVE_PACKAGES
        }
        mutableState.value = LauncherUiState(
            allApps = visibleApps,
            predictions = PredictionEngine.rank(
                apps = predictableApps,
                localEvents = preferences.launchEvents,
                systemEvents = systemEvents,
                pinnedPackages = preferences.pinnedPackages,
            ),
            hiddenPackages = preferences.hiddenPackages,
            pinnedPackages = preferences.pinnedPackages,
            hasUsageAccess = appsRepository.hasUsageAccess(),
            hasNotificationAccess = NotificationBadgeService.isEnabled(getApplication()),
            notificationCounts = NotificationBadgeService.counts.value,
            hasLocationPermission = weatherRepository.hasLocationPermission(),
            weather = mutableState.value.weather,
            isWeatherLoading = mutableState.value.isWeatherLoading,
            weatherUnavailable = mutableState.value.weatherUnavailable,
            isLoading = isLoading,
            launchError = mutableState.value.launchError,
        )
    }

    companion object {
        private val NON_PREDICTIVE_PACKAGES = setOf("com.android.settings")
    }
}
