package com.huimiying.homesort.launcher.model

data class WeatherContext(
    val temperatureCelsius: Int,
    val weatherCode: Int,
    val locationName: String,
) {
    val condition: WeatherCondition
        get() = WeatherCondition.fromCode(weatherCode)
}

enum class WeatherCondition(val label: String) {
    CLEAR("晴"),
    PARTLY_CLOUDY("多云"),
    FOG("有雾"),
    RAIN("有雨"),
    SNOW("有雪"),
    THUNDERSTORM("雷雨"),
    UNKNOWN("天气"),
    ;

    companion object {
        fun fromCode(code: Int): WeatherCondition = when (code) {
            0 -> CLEAR
            1, 2, 3 -> PARTLY_CLOUDY
            45, 48 -> FOG
            51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82 -> RAIN
            71, 73, 75, 77, 85, 86 -> SNOW
            95, 96, 99 -> THUNDERSTORM
            else -> UNKNOWN
        }
    }
}
