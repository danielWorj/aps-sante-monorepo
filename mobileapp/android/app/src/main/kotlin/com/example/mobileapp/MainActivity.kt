package com.example.mobileapp

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import androidx.core.content.FileProvider
import io.flutter.embedding.android.FlutterFragmentActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import java.io.File

// flutter_stripe (PaymentSheet) exige FlutterFragmentActivity, pas FlutterActivity.
class MainActivity : FlutterFragmentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        creerCanalNotifications()
    }

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "aps/mise_a_jour")
            .setMethodCallHandler { appel, resultat ->
                when (appel.method) {
                    "infosVersion" -> resultat.success(infosVersion())
                    "dossierTelechargement" -> {
                        val dossier = File(cacheDir, "mises_a_jour").apply { mkdirs() }
                        resultat.success(dossier.absolutePath)
                    }
                    "peutInstaller" -> resultat.success(peutInstaller())
                    "ouvrirReglagesInstallation" -> {
                        ouvrirReglagesInstallation()
                        resultat.success(null)
                    }
                    "installer" -> {
                        val chemin = appel.argument<String>("chemin")
                        if (chemin == null) {
                            resultat.error("argument", "Chemin de l'APK manquant", null)
                        } else {
                            try {
                                installer(File(chemin))
                                resultat.success(null)
                            } catch (e: Exception) {
                                resultat.error("installation", e.message, null)
                            }
                        }
                    }
                    else -> resultat.notImplemented()
                }
            }
    }

    // Version installée : versionName (« 1.0.0 ») et versionCode (2001 en
    // split-per-abi arm64), comparés à l'APK publiée côté serveur.
    private fun infosVersion(): Map<String, Any?> {
        val infos = packageManager.getPackageInfo(packageName, 0)
        val code = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            infos.longVersionCode
        } else {
            @Suppress("DEPRECATION")
            infos.versionCode.toLong()
        }
        return mapOf("versionName" to infos.versionName, "versionCode" to code)
    }

    // Android 8+ : l'utilisateur doit autoriser ApSa à installer des applications.
    private fun peutInstaller(): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.O || packageManager.canRequestPackageInstalls()

    private fun ouvrirReglagesInstallation() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        startActivity(
            Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:$packageName"))
        )
    }

    private fun installer(apk: File) {
        val uri = FileProvider.getUriForFile(this, "$packageName.mises_a_jour", apk)
        val intention = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, "application/vnd.android.package-archive")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        startActivity(intention)
    }

    // Canal des notifications push « Rendez-vous » (rappels, demandes, réponses) :
    // importance haute pour l'affichage en bandeau. Même identifiant que
    // default_notification_channel_id (AndroidManifest) et que le serveur (aps_rdv).
    private fun creerCanalNotifications() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val canal = NotificationChannel(
            "aps_rdv",
            "Rendez-vous",
            NotificationManager.IMPORTANCE_HIGH,
        ).apply {
            description = "Rappels de rendez-vous, demandes et réponses des médecins"
        }
        getSystemService(NotificationManager::class.java)?.createNotificationChannel(canal)
    }
}
