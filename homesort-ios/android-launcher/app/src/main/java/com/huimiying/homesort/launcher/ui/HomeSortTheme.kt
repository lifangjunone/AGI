package com.huimiying.homesort.launcher.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

object HomeSortColors {
    val Paper = Color(0xFFF5F1E8)
    val PaperRaised = Color(0xFFFFFCF5)
    val Ink = Color(0xFF171612)
    val Muted = Color(0xFF777168)
    val Line = Color(0xFFD7CFC1)
    val Accent = Color(0xFFF05B3D)
    val Green = Color(0xFF3F7657)
}

private val HomeSortScheme = lightColorScheme(
    primary = HomeSortColors.Accent,
    onPrimary = Color.White,
    secondary = HomeSortColors.Green,
    background = HomeSortColors.Paper,
    onBackground = HomeSortColors.Ink,
    surface = HomeSortColors.PaperRaised,
    onSurface = HomeSortColors.Ink,
    outline = HomeSortColors.Line,
)

@Composable
fun HomeSortTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = HomeSortScheme,
        content = content,
    )
}
