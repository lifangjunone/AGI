package com.huimiying.homesort.launcher

import android.app.role.RoleManager
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.core.net.toUri
import com.huimiying.homesort.launcher.ui.HomeSortLauncher
import com.huimiying.homesort.launcher.ui.HomeSortTheme

class MainActivity : ComponentActivity() {
    private val viewModel: LauncherViewModel by viewModels()
    private var isDefaultHome by mutableStateOf(false)
    private var homeRequestKey by mutableIntStateOf(0)

    private val roleRequest = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult(),
    ) {
        isDefaultHome = resolveDefaultHome()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        onBackPressedDispatcher.addCallback(
            this,
            object : OnBackPressedCallback(true) {
                override fun handleOnBackPressed() = Unit
            },
        )

        setContent {
            HomeSortTheme {
                HomeSortLauncher(
                    viewModel = viewModel,
                    isDefaultHome = isDefaultHome,
                    homeRequestKey = homeRequestKey,
                    onRequestDefaultHome = ::requestDefaultHome,
                    onRequestUsageAccess = ::requestUsageAccess,
                    onRequestNotificationAccess = ::requestNotificationAccess,
                )
            }
        }
    }

    override fun onResume() {
        super.onResume()
        isDefaultHome = resolveDefaultHome()
        viewModel.refresh()
        viewModel.refreshWeather()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        if (intent.hasCategory(Intent.CATEGORY_HOME)) {
            homeRequestKey += 1
        }
    }

    private fun requestDefaultHome() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val roleManager = getSystemService(RoleManager::class.java)
            if (roleManager.isRoleAvailable(RoleManager.ROLE_HOME)) {
                roleRequest.launch(roleManager.createRequestRoleIntent(RoleManager.ROLE_HOME))
                return
            }
        }
        roleRequest.launch(Intent(Settings.ACTION_HOME_SETTINGS))
    }

    private fun requestUsageAccess() {
        roleRequest.launch(
            Intent(
                Settings.ACTION_USAGE_ACCESS_SETTINGS,
                "package:$packageName".toUri(),
            ),
        )
    }

    private fun requestNotificationAccess() {
        roleRequest.launch(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
    }

    private fun resolveDefaultHome(): Boolean {
        val intent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME)
        val resolved = packageManager.resolveActivity(intent, 0)
        return resolved?.activityInfo?.packageName == packageName
    }
}
