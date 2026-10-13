package com.huimiying.homesort.launcher.data

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.location.Geocoder
import android.location.Location
import android.location.LocationManager
import androidx.core.content.ContextCompat
import com.huimiying.homesort.launcher.model.WeatherContext
import java.net.HttpURLConnection
import java.net.URL
import java.util.Locale
import kotlin.coroutines.resume
import kotlin.math.roundToInt
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

class WeatherRepository(private val context: Context) {
    private val locationManager = context.getSystemService(LocationManager::class.java)
    private val json = Json { ignoreUnknownKeys = true }

    fun hasLocationPermission(): Boolean =
        ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.ACCESS_COARSE_LOCATION,
        ) == PackageManager.PERMISSION_GRANTED

    suspend fun loadCurrentWeather(): WeatherContext {
        check(hasLocationPermission()) { "Location permission is required" }
        val location = currentLocation() ?: error("Current location is unavailable")
        val locationName = reverseGeocode(location)
        val current = fetchWeather(location)
        return WeatherContext(
            temperatureCelsius = current.temperature.roundToInt(),
            weatherCode = current.weatherCode,
            locationName = locationName,
        )
    }

    @SuppressLint("MissingPermission")
    private suspend fun currentLocation(): Location? = suspendCancellableCoroutine { continuation ->
        val provider = when {
            locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER) ->
                LocationManager.NETWORK_PROVIDER
            locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER) ->
                LocationManager.GPS_PROVIDER
            else -> null
        }
        if (provider == null) {
            continuation.resume(null)
            return@suspendCancellableCoroutine
        }

        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.R) {
            locationManager.getCurrentLocation(
                provider,
                null,
                context.mainExecutor,
            ) { continuation.resume(it) }
        } else {
            @Suppress("DEPRECATION")
            val lastKnown = locationManager.getLastKnownLocation(provider)
            continuation.resume(lastKnown)
        }
    }

    @Suppress("DEPRECATION")
    private suspend fun reverseGeocode(location: Location): String = withContext(Dispatchers.IO) {
        runCatching {
            val address = Geocoder(context, Locale.CHINA)
                .getFromLocation(location.latitude, location.longitude, 1)
                ?.firstOrNull()
            address?.locality
                ?: address?.subAdminArea
                ?: address?.adminArea
                ?: "当前位置"
        }.getOrDefault("当前位置")
    }

    private suspend fun fetchWeather(location: Location): CurrentWeather =
        withContext(Dispatchers.IO) {
            val endpoint = URL(
                "https://api.open-meteo.com/v1/forecast" +
                    "?latitude=${location.latitude}" +
                    "&longitude=${location.longitude}" +
                    "&current=temperature_2m,weather_code",
            )
            val connection = endpoint.openConnection() as HttpURLConnection
            connection.connectTimeout = 8_000
            connection.readTimeout = 8_000
            connection.setRequestProperty("Accept", "application/json")
            try {
                check(connection.responseCode in 200..299) {
                    "Weather request failed: ${connection.responseCode}"
                }
                val response = connection.inputStream.bufferedReader().use { it.readText() }
                json.decodeFromString<WeatherResponse>(response).current
            } finally {
                connection.disconnect()
            }
        }
}

@Serializable
private data class WeatherResponse(
    val current: CurrentWeather,
)

@Serializable
private data class CurrentWeather(
    @SerialName("temperature_2m") val temperature: Double,
    @SerialName("weather_code") val weatherCode: Int,
)
