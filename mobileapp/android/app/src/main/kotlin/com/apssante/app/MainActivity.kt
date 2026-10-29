package com.apssante.app

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Intent
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.net.ConnectivityManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import androidx.core.content.FileProvider
import io.flutter.embedding.android.FlutterFragmentActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import java.io.File
import java.security.MessageDigest

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
                    "analyserApk" -> {
                        val chemin = appel.argument<String>("chemin")
                        if (chemin == null) {
                            resultat.error("argument", "Chemin de l'APK manquant", null)
                        } else {
                            resultat.success(analyserApk(File(chemin)))
                        }
                    }
                    "empreinteSha256" -> {
                        val chemin = appel.argument<String>("chemin")
                        if (chemin == null) {
                            resultat.error("argument", "Chemin de l'APK manquant", null)
                        } else {
                            // APK de plusieurs dizaines de Mo : lecture hors du fil principal.
                            Thread {
                                val empreinte = try {
                                    empreinteSha256(File(chemin))
                                } catch (e: Exception) {
                                    null
                                }
                                runOnUiThread { resultat.success(empreinte) }
                            }.start()
                        }
                    }
                    "reseauNonFacture" -> resultat.success(reseauNonFacture())
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
        return mapOf("versionName" to infos.versionName, "versionCode" to codeVersion(infos))
    }

    // Contrôle de l'APK téléchargée avant d'ouvrir l'installateur : Android
    // n'accepte une mise à jour que pour le même paquet, un versionCode
    // strictement supérieur et la même clé de signature. Sinon l'installateur
    // affiche seulement « Application non installée » (ou installe une
    // seconde application si le paquet diffère) et la version reste la même.
    // Retourne le motif du refus (« illisible », « paquet », « version »,
    // « signature ») ou null si l'APK peut remplacer la version installée.
    private fun analyserApk(apk: File): Map<String, Any?> {
        val drapeaux = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            PackageManager.GET_SIGNING_CERTIFICATES
        } else {
            0
        }
        val archive = packageManager.getPackageArchiveInfo(apk.absolutePath, drapeaux)
            ?: return mapOf("refus" to "illisible")
        val installee = packageManager.getPackageInfo(packageName, drapeaux)
        val codeArchive = codeVersion(archive)
        val codeInstalle = codeVersion(installee)
        val refus = when {
            archive.packageName != packageName -> "paquet"
            codeArchive <= codeInstalle -> "version"
            !memeSignature(archive, installee) -> "signature"
            else -> null
        }
        return mapOf(
            "refus" to refus,
            "paquet" to archive.packageName,
            "versionCode" to codeArchive,
            "versionCodeInstalle" to codeInstalle,
        )
    }

    private fun codeVersion(infos: PackageInfo): Long =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            infos.longVersionCode
        } else {
            @Suppress("DEPRECATION")
            infos.versionCode.toLong()
        }

    // La clé actuelle de l'application installée doit figurer dans la lignée
    // de signature de l'APK. Avant Android 9, pas de lecture fiable de la
    // signature d'une archive : on laisse l'installateur trancher.
    private fun memeSignature(archive: PackageInfo, installee: PackageInfo): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) return true
        val signesArchive = archive.signingInfo?.let {
            if (it.hasMultipleSigners()) it.apkContentsSigners else it.signingCertificateHistory
        } ?: return true
        val signesInstalle = installee.signingInfo?.apkContentsSigners ?: return true
        return signesInstalle.any { cle -> signesArchive.any { it == cle } }
    }

    // Empreinte SHA-256 (hexadécimal) de l'APK téléchargée, comparée à celle
    // calculée par le serveur au téléversement : écarte un fichier tronqué ou
    // altéré en chemin avant d'ouvrir l'installateur.
    private fun empreinteSha256(fichier: File): String {
        val condensat = MessageDigest.getInstance("SHA-256")
        fichier.inputStream().use { flux ->
            val tampon = ByteArray(64 * 1024)
            while (true) {
                val lus = flux.read(tampon)
                if (lus < 0) break
                condensat.update(tampon, 0, lus)
            }
        }
        return condensat.digest().joinToString("") { "%02x".format(it) }
    }

    // Wi-Fi ou réseau non facturé : le pré-téléchargement silencieux d'une
    // mise à jour ne consomme pas le forfait mobile de l'utilisateur.
    private fun reseauNonFacture(): Boolean {
        val connectivite = getSystemService(ConnectivityManager::class.java) ?: return false
        return connectivite.activeNetwork != null && !connectivite.isActiveNetworkMetered
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
