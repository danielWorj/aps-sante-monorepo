package com.example.mobileapp

import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import android.os.Bundle
import io.flutter.embedding.android.FlutterFragmentActivity

// flutter_stripe (PaymentSheet) exige FlutterFragmentActivity, pas FlutterActivity.
class MainActivity : FlutterFragmentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        creerCanalNotifications()
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
