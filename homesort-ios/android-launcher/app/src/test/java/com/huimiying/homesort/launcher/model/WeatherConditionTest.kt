package com.huimiying.homesort.launcher.model

import org.junit.Assert.assertEquals
import org.junit.Test

class WeatherConditionTest {
    @Test
    fun mapsOpenMeteoWeatherCodes() {
        assertEquals(WeatherCondition.CLEAR, WeatherCondition.fromCode(0))
        assertEquals(WeatherCondition.PARTLY_CLOUDY, WeatherCondition.fromCode(2))
        assertEquals(WeatherCondition.FOG, WeatherCondition.fromCode(45))
        assertEquals(WeatherCondition.RAIN, WeatherCondition.fromCode(63))
        assertEquals(WeatherCondition.SNOW, WeatherCondition.fromCode(75))
        assertEquals(WeatherCondition.THUNDERSTORM, WeatherCondition.fromCode(95))
        assertEquals(WeatherCondition.UNKNOWN, WeatherCondition.fromCode(-1))
    }
}
