package com.huimiying.homesort.launcher.ui

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowForward
import androidx.compose.material.icons.rounded.Apps
import androidx.compose.material.icons.rounded.Cloud
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.DeleteOutline
import androidx.compose.material.icons.rounded.DragHandle
import androidx.compose.material.icons.rounded.Home
import androidx.compose.material.icons.rounded.Info
import androidx.compose.material.icons.rounded.KeyboardArrowUp
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.LocationOn
import androidx.compose.material.icons.rounded.MoreVert
import androidx.compose.material.icons.rounded.PushPin
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.rounded.Restore
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material.icons.rounded.Thunderstorm
import androidx.compose.material.icons.rounded.WaterDrop
import androidx.compose.material.icons.rounded.WbSunny
import androidx.compose.material.icons.rounded.AcUnit
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.graphics.drawable.toBitmap
import androidx.core.net.toUri
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.huimiying.homesort.launcher.LauncherViewModel
import com.huimiying.homesort.launcher.model.LaunchableApp
import com.huimiying.homesort.launcher.model.Prediction
import com.huimiying.homesort.launcher.model.WeatherCondition
import com.huimiying.homesort.launcher.model.WeatherContext
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlinx.coroutines.delay

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeSortLauncher(
    viewModel: LauncherViewModel,
    isDefaultHome: Boolean,
    homeRequestKey: Int,
    onRequestDefaultHome: () -> Unit,
    onRequestUsageAccess: () -> Unit,
    onRequestNotificationAccess: () -> Unit,
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    var showDrawer by remember { mutableStateOf(false) }
    var showSettings by remember { mutableStateOf(false) }
    var selectedApp by remember { mutableStateOf<LaunchableApp?>(null) }
    var dragDistance by remember { mutableFloatStateOf(0f) }
    val locationPermissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) {
        viewModel.refreshWeather()
    }

    LaunchedEffect(homeRequestKey) {
        showDrawer = false
        showSettings = false
        selectedApp = null
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(HomeSortColors.Paper)
            .pointerInput(Unit) {
                detectVerticalDragGestures(
                    onDragStart = { dragDistance = 0f },
                    onVerticalDrag = { _, amount -> dragDistance += amount },
                    onDragEnd = {
                        if (dragDistance < -80f) showDrawer = true
                        dragDistance = 0f
                    },
                )
            },
    ) {
        LauncherHome(
            predictions = state.predictions.take(5),
            notificationCounts = state.notificationCounts,
            weather = state.weather,
            hasLocationPermission = state.hasLocationPermission,
            isWeatherLoading = state.isWeatherLoading,
            weatherUnavailable = state.weatherUnavailable,
            isDefaultHome = isDefaultHome,
            hasUsageAccess = state.hasUsageAccess,
            onLaunch = viewModel::launch,
            onOpenDrawer = { showDrawer = true },
            onOpenSettings = { showSettings = true },
            onRequestLocation = {
                locationPermissionLauncher.launch(Manifest.permission.ACCESS_COARSE_LOCATION)
            },
            onRefreshWeather = viewModel::refreshWeather,
            onRequestDefaultHome = onRequestDefaultHome,
        )
    }

    if (showDrawer) {
        AppDrawer(
            apps = state.allApps,
            onDismiss = { showDrawer = false },
            onLaunch = viewModel::launch,
            onManage = {
                showDrawer = false
                selectedApp = it
            },
        )
    }

    if (showSettings) {
        SettingsSheet(
            isDefaultHome = isDefaultHome,
            hasUsageAccess = state.hasUsageAccess,
            hasNotificationAccess = state.hasNotificationAccess,
            hiddenCount = state.hiddenPackages.size,
            onDismiss = { showSettings = false },
            onRequestDefaultHome = onRequestDefaultHome,
            onRequestUsageAccess = onRequestUsageAccess,
            onRequestNotificationAccess = onRequestNotificationAccess,
            onClearMemory = viewModel::clearMemory,
            onRestoreHiddenApps = viewModel::restoreHiddenApps,
        )
    }

    selectedApp?.let { app ->
        AppActionsSheet(
            app = app,
            isPinned = app.packageName in state.pinnedPackages,
            onDismiss = { selectedApp = null },
            onLaunch = viewModel::launch,
            onTogglePinned = viewModel::togglePinned,
            onHide = viewModel::toggleHidden,
        )
    }

    state.launchError?.let { message ->
        AlertDialog(
            onDismissRequest = viewModel::dismissError,
            confirmButton = {
                TextButton(onClick = viewModel::dismissError) {
                    Text("知道了")
                }
            },
            title = { Text("无法打开应用") },
            text = { Text(message) },
        )
    }
}

@Composable
private fun LauncherHome(
    predictions: List<Prediction>,
    notificationCounts: Map<String, Int>,
    weather: WeatherContext?,
    hasLocationPermission: Boolean,
    isWeatherLoading: Boolean,
    weatherUnavailable: Boolean,
    isDefaultHome: Boolean,
    hasUsageAccess: Boolean,
    onLaunch: (LaunchableApp) -> Unit,
    onOpenDrawer: () -> Unit,
    onOpenSettings: () -> Unit,
    onRequestLocation: () -> Unit,
    onRefreshWeather: () -> Unit,
    onRequestDefaultHome: () -> Unit,
) {
    var now by remember { mutableStateOf(LocalDateTime.now()) }
    LaunchedEffect(Unit) {
        while (true) {
            delay(30_000)
            now = LocalDateTime.now()
        }
    }
    val date = now.format(DateTimeFormatter.ofPattern("M月d日 EEEE", Locale.CHINA))
    if (LocalConfiguration.current.orientation == android.content.res.Configuration.ORIENTATION_LANDSCAPE) {
        LandscapeLauncherHome(
            predictions = predictions,
            notificationCounts = notificationCounts,
            now = now,
            date = date,
            weather = weather,
            hasLocationPermission = hasLocationPermission,
            isWeatherLoading = isWeatherLoading,
            weatherUnavailable = weatherUnavailable,
            isDefaultHome = isDefaultHome,
            hasUsageAccess = hasUsageAccess,
            onLaunch = onLaunch,
            onOpenDrawer = onOpenDrawer,
            onOpenSettings = onOpenSettings,
            onRequestLocation = onRequestLocation,
            onRefreshWeather = onRefreshWeather,
            onRequestDefaultHome = onRequestDefaultHome,
        )
        return
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .statusBarsPadding()
            .navigationBarsPadding()
            .padding(horizontal = 20.dp),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            BrandMark()
            Spacer(Modifier.weight(1f))
            IconButton(onClick = onOpenSettings) {
                Icon(Icons.Rounded.Settings, contentDescription = "设置")
            }
        }

        Spacer(Modifier.height(18.dp))
        ClockWeatherHeader(
            now = now,
            date = date,
            weather = weather,
            hasLocationPermission = hasLocationPermission,
            isWeatherLoading = isWeatherLoading,
            weatherUnavailable = weatherUnavailable,
            onRequestLocation = onRequestLocation,
            onRefreshWeather = onRefreshWeather,
        )

        if (!isDefaultHome) {
            DefaultHomeBanner(onRequestDefaultHome)
        } else if (!hasUsageAccess) {
            Text(
                text = "开启使用情况访问后，预测会依据系统真实使用逐步更新。",
                modifier = Modifier.padding(top = 16.dp),
                color = HomeSortColors.Muted,
                style = MaterialTheme.typography.bodySmall,
            )
        }

        Spacer(Modifier.height(24.dp))
        predictions.firstOrNull()?.let { prediction ->
            PrimaryPrediction(
                prediction = prediction,
                badgeCount = notificationCounts[prediction.app.packageName] ?: 0,
                onLaunch = onLaunch,
            )
        } ?: EmptyPrediction()

        Spacer(Modifier.height(16.dp))
        predictions.drop(1).take(4).chunked(2).forEachIndexed { rowIndex, row ->
            if (rowIndex > 0) Spacer(Modifier.height(8.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                row.forEach { prediction ->
                    PredictionTile(
                        prediction = prediction,
                        badgeCount = notificationCounts[prediction.app.packageName] ?: 0,
                        onLaunch = onLaunch,
                        modifier = Modifier.weight(1f),
                        height = 82,
                    )
                }
                if (row.size == 1) Spacer(Modifier.weight(1f))
            }
        }

        Spacer(Modifier.weight(1f))
        Surface(
            onClick = onOpenDrawer,
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(8.dp),
            color = HomeSortColors.PaperRaised,
            border = androidx.compose.foundation.BorderStroke(1.dp, HomeSortColors.Line),
        ) {
            Row(
                modifier = Modifier.padding(horizontal = 18.dp, vertical = 14.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(Icons.Rounded.Search, contentDescription = null, tint = HomeSortColors.Muted)
                Text(
                    text = "搜索全部应用",
                    modifier = Modifier.padding(start = 10.dp),
                    color = HomeSortColors.Muted,
                )
                Spacer(Modifier.weight(1f))
                Icon(Icons.Rounded.KeyboardArrowUp, contentDescription = null)
            }
        }
        Text(
            text = "向上滑动查看全部应用",
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 10.dp),
            color = HomeSortColors.Muted,
            textAlign = TextAlign.Center,
            style = MaterialTheme.typography.labelSmall,
        )
    }
}

@Composable
private fun LandscapeLauncherHome(
    predictions: List<Prediction>,
    notificationCounts: Map<String, Int>,
    now: LocalDateTime,
    date: String,
    weather: WeatherContext?,
    hasLocationPermission: Boolean,
    isWeatherLoading: Boolean,
    weatherUnavailable: Boolean,
    isDefaultHome: Boolean,
    hasUsageAccess: Boolean,
    onLaunch: (LaunchableApp) -> Unit,
    onOpenDrawer: () -> Unit,
    onOpenSettings: () -> Unit,
    onRequestLocation: () -> Unit,
    onRefreshWeather: () -> Unit,
    onRequestDefaultHome: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxSize()
            .statusBarsPadding()
            .navigationBarsPadding()
            .padding(20.dp),
        horizontalArrangement = Arrangement.spacedBy(24.dp),
    ) {
        Column(
            modifier = Modifier
                .weight(0.42f)
                .fillMaxHeight(),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                BrandMark()
                Spacer(Modifier.weight(1f))
                IconButton(onClick = onOpenSettings) {
                    Icon(Icons.Rounded.Settings, contentDescription = "设置")
                }
            }
            Spacer(Modifier.height(18.dp))
            ClockWeatherHeader(
                now = now,
                date = date,
                weather = weather,
                hasLocationPermission = hasLocationPermission,
                isWeatherLoading = isWeatherLoading,
                weatherUnavailable = weatherUnavailable,
                onRequestLocation = onRequestLocation,
                onRefreshWeather = onRefreshWeather,
                compact = true,
            )
            Spacer(Modifier.weight(1f))
            if (!isDefaultHome) {
                Button(onClick = onRequestDefaultHome) {
                    Icon(Icons.Rounded.Home, contentDescription = null)
                    Text("设为默认桌面", Modifier.padding(start = 8.dp))
                }
            } else if (!hasUsageAccess) {
                Text(
                    "授权使用情况访问后启用系统级预测",
                    color = HomeSortColors.Muted,
                    style = MaterialTheme.typography.bodySmall,
                )
            }
        }

        Column(
            modifier = Modifier
                .weight(0.58f)
                .fillMaxHeight(),
        ) {
            predictions.firstOrNull()?.let {
                PrimaryPrediction(
                    prediction = it,
                    badgeCount = notificationCounts[it.app.packageName] ?: 0,
                    onLaunch = onLaunch,
                )
            } ?: EmptyPrediction()
            Spacer(Modifier.height(10.dp))
            predictions.drop(1).take(4).chunked(2).forEachIndexed { rowIndex, row ->
                if (rowIndex > 0) Spacer(Modifier.height(8.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    row.forEach { prediction ->
                        PredictionTile(
                            prediction = prediction,
                            badgeCount = notificationCounts[prediction.app.packageName] ?: 0,
                            onLaunch = onLaunch,
                            modifier = Modifier.weight(1f),
                            height = 72,
                        )
                    }
                    if (row.size == 1) Spacer(Modifier.weight(1f))
                }
            }
            Spacer(Modifier.weight(1f))
            Surface(
                onClick = onOpenDrawer,
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(8.dp),
                color = HomeSortColors.PaperRaised,
                border = androidx.compose.foundation.BorderStroke(1.dp, HomeSortColors.Line),
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(Icons.Rounded.Search, contentDescription = null, tint = HomeSortColors.Muted)
                    Text(
                        "搜索全部应用",
                        modifier = Modifier.padding(start = 10.dp),
                        color = HomeSortColors.Muted,
                    )
                    Spacer(Modifier.weight(1f))
                    Icon(Icons.Rounded.KeyboardArrowUp, contentDescription = null)
                }
            }
        }
    }
}

@Composable
private fun ClockWeatherHeader(
    now: LocalDateTime,
    date: String,
    weather: WeatherContext?,
    hasLocationPermission: Boolean,
    isWeatherLoading: Boolean,
    weatherUnavailable: Boolean,
    onRequestLocation: () -> Unit,
    onRefreshWeather: () -> Unit,
    compact: Boolean = false,
) {
    Text(
        text = now.format(DateTimeFormatter.ofPattern("HH:mm")),
        color = HomeSortColors.Ink,
        fontSize = if (compact) 54.sp else 68.sp,
        fontFamily = FontFamily.Serif,
        fontWeight = FontWeight.Bold,
        letterSpacing = 0.sp,
    )
    Text(
        text = date,
        modifier = Modifier.padding(top = 2.dp),
        color = HomeSortColors.Accent,
        style = MaterialTheme.typography.labelLarge,
    )
    Row(
        modifier = Modifier.padding(top = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(7.dp),
    ) {
        when {
            weather != null -> {
                Icon(
                    imageVector = weather.condition.icon(),
                    contentDescription = weather.condition.label,
                    modifier = Modifier.size(18.dp),
                    tint = HomeSortColors.Ink,
                )
                Text(
                    "${weather.temperatureCelsius}°  ${weather.condition.label}",
                    color = HomeSortColors.Ink,
                    style = MaterialTheme.typography.bodyMedium,
                )
                Text("·", color = HomeSortColors.Line)
                Icon(
                    Icons.Rounded.LocationOn,
                    contentDescription = null,
                    modifier = Modifier.size(17.dp),
                    tint = HomeSortColors.Muted,
                )
                Text(
                    weather.locationName,
                    color = HomeSortColors.Muted,
                    style = MaterialTheme.typography.bodyMedium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            !hasLocationPermission -> {
                Icon(
                    Icons.Rounded.LocationOn,
                    contentDescription = null,
                    modifier = Modifier.size(18.dp),
                    tint = HomeSortColors.Accent,
                )
                TextButton(onClick = onRequestLocation, contentPadding = PaddingValues(0.dp)) {
                    Text("开启位置，显示当地天气")
                }
            }
            isWeatherLoading -> {
                Text(
                    "正在获取当前位置和天气…",
                    color = HomeSortColors.Muted,
                    style = MaterialTheme.typography.bodyMedium,
                )
            }
            weatherUnavailable -> {
                Icon(
                    Icons.Rounded.Refresh,
                    contentDescription = null,
                    modifier = Modifier.size(17.dp),
                    tint = HomeSortColors.Accent,
                )
                TextButton(onClick = onRefreshWeather, contentPadding = PaddingValues(0.dp)) {
                    Text("天气暂不可用，点击重试")
                }
            }
        }
    }
}

private fun WeatherCondition.icon() = when (this) {
    WeatherCondition.CLEAR -> Icons.Rounded.WbSunny
    WeatherCondition.PARTLY_CLOUDY, WeatherCondition.FOG, WeatherCondition.UNKNOWN ->
        Icons.Rounded.Cloud
    WeatherCondition.RAIN -> Icons.Rounded.WaterDrop
    WeatherCondition.SNOW -> Icons.Rounded.AcUnit
    WeatherCondition.THUNDERSTORM -> Icons.Rounded.Thunderstorm
}

@Composable
private fun BrandMark() {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(
            modifier = Modifier
                .size(38.dp)
                .clip(RoundedCornerShape(8.dp))
                .background(HomeSortColors.Ink),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                Icons.Rounded.Apps,
                contentDescription = null,
                tint = HomeSortColors.PaperRaised,
                modifier = Modifier.size(22.dp),
            )
        }
        Text(
            text = "HomeSort",
            modifier = Modifier.padding(start = 10.dp),
            color = HomeSortColors.Ink,
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.Bold,
        )
    }
}

@Composable
private fun DefaultHomeBanner(onRequestDefaultHome: () -> Unit) {
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 16.dp),
        shape = RoundedCornerShape(8.dp),
        color = HomeSortColors.PaperRaised,
        border = androidx.compose.foundation.BorderStroke(1.dp, HomeSortColors.Accent),
    ) {
        Row(
            modifier = Modifier.padding(14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(Icons.Rounded.Home, contentDescription = null, tint = HomeSortColors.Accent)
            Column(
                modifier = Modifier
                    .weight(1f)
                    .padding(horizontal = 10.dp),
            ) {
                Text("还差最后一步", fontWeight = FontWeight.SemiBold)
                Text(
                    "设为默认桌面后，解锁和 Home 键都会回到这里。",
                    color = HomeSortColors.Muted,
                    style = MaterialTheme.typography.bodySmall,
                )
            }
            Button(
                onClick = onRequestDefaultHome,
                contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp),
            ) {
                Text("设为默认")
            }
        }
    }
}

@Composable
private fun PrimaryPrediction(
    prediction: Prediction,
    badgeCount: Int,
    onLaunch: (LaunchableApp) -> Unit,
) {
    Surface(
        onClick = { onLaunch(prediction.app) },
        modifier = Modifier
            .fillMaxWidth()
            .height(146.dp),
        shape = RoundedCornerShape(8.dp),
        color = HomeSortColors.Ink,
    ) {
        Row(
            modifier = Modifier.padding(20.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            RealAppIcon(prediction.app, size = 68, badgeCount = badgeCount)
            Column(
                modifier = Modifier
                    .weight(1f)
                    .padding(horizontal = 18.dp),
            ) {
                Text(
                    "此刻最可能",
                    color = HomeSortColors.Paper.copy(alpha = 0.65f),
                    style = MaterialTheme.typography.labelLarge,
                )
                Text(
                    prediction.app.label,
                    color = HomeSortColors.PaperRaised,
                    style = MaterialTheme.typography.headlineMedium,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    prediction.reason,
                    color = HomeSortColors.Paper.copy(alpha = 0.65f),
                    style = MaterialTheme.typography.bodyMedium,
                )
            }
            Icon(
                Icons.AutoMirrored.Rounded.ArrowForward,
                contentDescription = "打开 ${prediction.app.label}",
                tint = HomeSortColors.PaperRaised,
                modifier = Modifier.size(30.dp),
            )
        }
    }
}

@Composable
private fun EmptyPrediction() {
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .height(146.dp),
        shape = RoundedCornerShape(8.dp),
        color = HomeSortColors.Ink,
    ) {
        Column(
            modifier = Modifier.padding(20.dp),
            verticalArrangement = Arrangement.Center,
        ) {
            Text(
                "正在读取可启动应用",
                color = HomeSortColors.PaperRaised,
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold,
            )
            Text(
                "这里不会出现演示数据。",
                color = HomeSortColors.Paper.copy(alpha = 0.65f),
            )
        }
    }
}

@Composable
private fun PredictionTile(
    prediction: Prediction,
    badgeCount: Int,
    onLaunch: (LaunchableApp) -> Unit,
    modifier: Modifier = Modifier,
    height: Int = 116,
) {
    Surface(
        onClick = { onLaunch(prediction.app) },
        modifier = modifier.height(height.dp),
        shape = RoundedCornerShape(8.dp),
        color = HomeSortColors.PaperRaised,
        border = androidx.compose.foundation.BorderStroke(1.dp, HomeSortColors.Line),
    ) {
        Column(
            modifier = Modifier.padding(12.dp),
            verticalArrangement = Arrangement.SpaceBetween,
        ) {
            RealAppIcon(prediction.app, size = 42, badgeCount = badgeCount)
            Text(
                prediction.app.label,
                color = HomeSortColors.Ink,
                style = MaterialTheme.typography.labelLarge,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalFoundationApi::class)
@Composable
private fun AppDrawer(
    apps: List<LaunchableApp>,
    onDismiss: () -> Unit,
    onLaunch: (LaunchableApp) -> Unit,
    onManage: (LaunchableApp) -> Unit,
) {
    var query by remember { mutableStateOf("") }
    val filtered = remember(apps, query) {
        if (query.isBlank()) apps else apps.filter {
            it.label.contains(query, ignoreCase = true) ||
                it.packageName.contains(query, ignoreCase = true)
        }
    }
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = HomeSortColors.Paper,
        dragHandle = {
            Icon(
                Icons.Rounded.DragHandle,
                contentDescription = null,
                modifier = Modifier.padding(8.dp),
                tint = HomeSortColors.Muted,
            )
        },
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .fillMaxHeight(0.92f),
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 20.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    "全部应用",
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.Bold,
                )
                Spacer(Modifier.weight(1f))
                Text("${apps.size} 个", color = HomeSortColors.Muted)
            }
            LauncherSearchField(
                value = query,
                onValueChange = { query = it },
                modifier = Modifier.padding(horizontal = 20.dp, vertical = 14.dp),
            )
            LazyVerticalGrid(
                columns = GridCells.Fixed(4),
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(18.dp),
            ) {
                items(filtered, key = { it.packageName }) { app ->
                    Column(
                        modifier = Modifier
                            .combinedClickable(
                                onClick = { onLaunch(app) },
                                onLongClick = { onManage(app) },
                            )
                            .padding(4.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        RealAppIcon(app, size = 54)
                        Text(
                            app.label,
                            modifier = Modifier.padding(top = 6.dp),
                            color = HomeSortColors.Ink,
                            style = MaterialTheme.typography.labelSmall,
                            textAlign = TextAlign.Center,
                            maxLines = 2,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun LauncherSearchField(
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    androidx.compose.material3.OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        modifier = modifier.fillMaxWidth(),
        placeholder = { Text("搜索应用") },
        leadingIcon = { Icon(Icons.Rounded.Search, contentDescription = null) },
        trailingIcon = {
            if (value.isNotEmpty()) {
                IconButton(onClick = { onValueChange("") }) {
                    Icon(Icons.Rounded.Close, contentDescription = "清除")
                }
            }
        },
        singleLine = true,
        shape = RoundedCornerShape(8.dp),
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SettingsSheet(
    isDefaultHome: Boolean,
    hasUsageAccess: Boolean,
    hasNotificationAccess: Boolean,
    hiddenCount: Int,
    onDismiss: () -> Unit,
    onRequestDefaultHome: () -> Unit,
    onRequestUsageAccess: () -> Unit,
    onRequestNotificationAccess: () -> Unit,
    onClearMemory: () -> Unit,
    onRestoreHiddenApps: () -> Unit,
) {
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = HomeSortColors.Paper,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .navigationBarsPadding()
                .padding(horizontal = 20.dp)
                .padding(bottom = 24.dp),
        ) {
            Text(
                "桌面设置",
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold,
            )
            Text(
                "所有预测数据默认只保存在本机。",
                modifier = Modifier.padding(top = 4.dp, bottom = 18.dp),
                color = HomeSortColors.Muted,
            )
            SettingAction(
                icon = Icons.Rounded.Home,
                title = "默认桌面",
                detail = if (isDefaultHome) "HomeSort 已完全接管 Home 键" else "尚未设为默认 Launcher",
                action = if (isDefaultHome) null else "立即设置",
                onClick = onRequestDefaultHome,
            )
            SettingAction(
                icon = Icons.Rounded.Lock,
                title = "真实使用学习",
                detail = if (hasUsageAccess) "已读取系统授权的前台使用记录" else "未授权，仅学习从 HomeSort 发起的启动",
                action = if (hasUsageAccess) null else "授权",
                onClick = onRequestUsageAccess,
            )
            SettingAction(
                icon = Icons.Rounded.Info,
                title = "消息角标",
                detail = if (hasNotificationAccess) "已显示各 App 的活动通知数量" else "授权后显示微信、飞书等通知数量",
                action = if (hasNotificationAccess) null else "授权",
                onClick = onRequestNotificationAccess,
            )
            SettingAction(
                icon = Icons.Rounded.Restore,
                title = "恢复隐藏应用",
                detail = "当前隐藏 $hiddenCount 个应用",
                action = if (hiddenCount > 0) "恢复" else null,
                onClick = onRestoreHiddenApps,
            )
            SettingAction(
                icon = Icons.Rounded.DeleteOutline,
                title = "删除预测记忆",
                detail = "清除 HomeSort 内部启动记录",
                action = "删除",
                onClick = onClearMemory,
            )
            Row(
                modifier = Modifier.padding(top = 18.dp),
                verticalAlignment = Alignment.Top,
            ) {
                Icon(
                    Icons.Rounded.Info,
                    contentDescription = null,
                    tint = HomeSortColors.Muted,
                    modifier = Modifier.size(18.dp),
                )
                Text(
                    "系统使用权限由 Android 设置管理。HomeSort 不读取消息内容、联系人或应用内部数据。",
                    modifier = Modifier.padding(start = 8.dp),
                    color = HomeSortColors.Muted,
                    style = MaterialTheme.typography.bodySmall,
                )
            }
        }
    }
}

@Composable
private fun SettingAction(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    title: String,
    detail: String,
    action: String?,
    onClick: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, contentDescription = null, tint = HomeSortColors.Muted)
        Column(
            modifier = Modifier
                .weight(1f)
                .padding(horizontal = 12.dp),
        ) {
            Text(title, fontWeight = FontWeight.SemiBold)
            Text(detail, color = HomeSortColors.Muted, style = MaterialTheme.typography.bodySmall)
        }
        if (action != null) {
            TextButton(onClick = onClick) {
                Text(action)
            }
        } else {
            Icon(Icons.Rounded.CheckCircle, contentDescription = "已完成", tint = HomeSortColors.Green)
        }
    }
    HorizontalDivider(color = HomeSortColors.Line)
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AppActionsSheet(
    app: LaunchableApp,
    isPinned: Boolean,
    onDismiss: () -> Unit,
    onLaunch: (LaunchableApp) -> Unit,
    onTogglePinned: (String) -> Unit,
    onHide: (String) -> Unit,
) {
    val context = LocalContext.current
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = HomeSortColors.Paper,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .navigationBarsPadding()
                .padding(horizontal = 20.dp)
                .padding(bottom = 24.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                RealAppIcon(app, size = 54)
                Column(Modifier.padding(start = 14.dp)) {
                    Text(app.label, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                    Text(app.packageName, color = HomeSortColors.Muted, style = MaterialTheme.typography.bodySmall)
                }
            }
            Spacer(Modifier.height(20.dp))
            Button(
                onClick = {
                    onDismiss()
                    onLaunch(app)
                },
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text("打开")
            }
            OutlinedButton(
                onClick = {
                    onTogglePinned(app.packageName)
                    onDismiss()
                },
                modifier = Modifier.fillMaxWidth(),
            ) {
                Icon(Icons.Rounded.PushPin, contentDescription = null)
                Text(if (isPinned) "取消固定" else "固定到预测入口", Modifier.padding(start = 8.dp))
            }
            OutlinedButton(
                onClick = {
                    onHide(app.packageName)
                    onDismiss()
                },
                modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.outlinedButtonColors(contentColor = HomeSortColors.Accent),
            ) {
                Icon(Icons.Rounded.Close, contentDescription = null)
                Text("从 HomeSort 隐藏", Modifier.padding(start = 8.dp))
            }
            TextButton(
                onClick = {
                    val intent = Intent(
                        Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                        "package:${app.packageName}".toUri(),
                    )
                    context.startActivity(intent)
                    onDismiss()
                },
                modifier = Modifier.fillMaxWidth(),
            ) {
                Icon(Icons.Rounded.MoreVert, contentDescription = null)
                Text("系统应用信息", Modifier.padding(start = 8.dp))
            }
        }
    }
}

@Composable
private fun RealAppIcon(app: LaunchableApp, size: Int, badgeCount: Int = 0) {
    val packageManager = LocalContext.current.packageManager
    val bitmap = remember(app.packageName) {
        runCatching {
            packageManager.getApplicationIcon(app.packageName)
                .toBitmap(width = size * 3, height = size * 3)
                .asImageBitmap()
        }.getOrNull()
    }

    Box {
        if (bitmap != null) {
            Image(
                bitmap = bitmap,
                contentDescription = app.label,
                modifier = Modifier
                    .size(size.dp)
                    .clip(RoundedCornerShape((size * 0.22f).dp)),
            )
        } else {
            Box(
                modifier = Modifier
                    .size(size.dp)
                    .clip(RoundedCornerShape((size * 0.22f).dp))
                    .background(HomeSortColors.Line),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    app.label.take(1),
                    color = HomeSortColors.Ink,
                    fontWeight = FontWeight.Bold,
                )
            }
        }
        if (badgeCount > 0) {
            Text(
                text = if (badgeCount > 99) "99+" else badgeCount.toString(),
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .padding(start = 2.dp)
                    .background(HomeSortColors.Accent, CircleShape)
                    .padding(horizontal = 5.dp, vertical = 2.dp),
                color = HomeSortColors.PaperRaised,
                fontSize = 10.sp,
                fontWeight = FontWeight.Bold,
            )
        }
    }
}
