import java.io.FileInputStream
import java.util.Base64
import java.util.Properties

plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

// ─── Signature release ────────────────────────────────────────────────
// Les mises à jour de l'application (écran « Mises à jour ») exigent que
// chaque APK soit signée avec la MÊME clé : Android refuse sinon de
// l'installer par-dessus. La clé debug change d'une machine à l'autre, elle
// ne doit donc jamais signer une release.
// android/key.properties (jamais versionné, voir android/.gitignore) :
//   storePassword=…  keyPassword=…  keyAlias=…  storeFile=<chemin du .jks>
val fichierCleSignature = rootProject.file("key.properties")
val proprietesCleSignature = Properties().apply {
    if (fichierCleSignature.exists()) FileInputStream(fichierCleSignature).use { load(it) }
}
val signatureReleaseConfiguree = fichierCleSignature.exists()

// ─── Marque ───────────────────────────────────────────────────────────
// Nom affiché sous l'icône = NOM_MARQUE passé par --dart-define (même
// variable que lib/utils/marque.dart). Flutter transmet les --dart-define à
// Gradle dans la propriété « dart-defines » : liste séparée par des
// virgules de « CLE=valeur » encodés en base64.
val dartDefines: Map<String, String> = (project.findProperty("dart-defines") as String?)
    ?.split(",")
    ?.mapNotNull { encode ->
        runCatching { String(Base64.getDecoder().decode(encode), Charsets.UTF_8) }.getOrNull()
    }
    ?.mapNotNull { paire ->
        val i = paire.indexOf('=')
        if (i > 0) paire.substring(0, i) to paire.substring(i + 1) else null
    }
    ?.toMap()
    ?: emptyMap()
val nomMarque: String = dartDefines["NOM_MARQUE"]?.trim()?.takeIf { it.isNotEmpty() } ?: "ApSa"

android {
    namespace = "com.apssante.app"
    compileSdk = 37
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        // TODO: Specify your own unique Application ID (https://developer.android.com/studio/build/application-id.html).
        applicationId = "com.apssante.app"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        //minSdk = flutter.minSdkVersion
        minSdk = 26
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
        // android:label="${nomMarque}" (AndroidManifest.xml)
        manifestPlaceholders["nomMarque"] = nomMarque
    }

    // Le lint "vital" de release analyse aussi les plugins : celui de stripe_android
    // réclame play-services-tapandpay (dépôt privé Google, introuvable) et fait échouer le build.
    lint {
        checkReleaseBuilds = false
    }

    signingConfigs {
        if (signatureReleaseConfiguree) {
            create("release") {
                keyAlias = proprietesCleSignature.getProperty("keyAlias")
                keyPassword = proprietesCleSignature.getProperty("keyPassword")
                storeFile = file(proprietesCleSignature.getProperty("storeFile"))
                storePassword = proprietesCleSignature.getProperty("storePassword")
            }
        }
    }

    buildTypes {
        release {
            // Sans key.properties, pas de signature : la vérification
            // ci-dessous fait échouer le build plutôt que de produire une
            // APK signée avec la clé debug.
            if (signatureReleaseConfiguree) {
                signingConfig = signingConfigs.getByName("release")
            }
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}

// Refus explicite d'un build release sans clé (les builds debug/profile ne
// sont pas concernés).
gradle.taskGraph.whenReady {
    val buildRelease = allTasks.any { it.project == project && it.name.contains("Release") }
    if (buildRelease && !signatureReleaseConfiguree) {
        throw GradleException(
            "Signature release absente : créez mobileapp/android/key.properties " +
                "(storePassword, keyPassword, keyAlias, storeFile) avant de construire une release."
        )
    }
}
