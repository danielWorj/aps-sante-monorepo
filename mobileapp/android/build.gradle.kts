allprojects {
    repositories {
        google()
        mavenCentral()
    }
}

val newBuildDir: Directory =
    rootProject.layout.buildDirectory
        .dir("../../build")
        .get()
rootProject.layout.buildDirectory.value(newBuildDir)

subprojects {
    val newSubprojectBuildDir: Directory = newBuildDir.dir(project.name)
    project.layout.buildDirectory.value(newSubprojectBuildDir)
}

// ▼▼▼ À AJOUTER (avant evaluationDependsOn) ▼▼▼
// Force un compileSdk >= 35 sur les plugins qui compilent encore contre 34
// (ex : jitsi_meet_flutter_sdk), sinon checkDebugAarMetadata échoue.
subprojects {
    afterEvaluate {
        extensions.findByName("android")?.let { ext ->
            if (ext is com.android.build.api.dsl.LibraryExtension) {
                val current = ext.compileSdk ?: 0
                if (current < 36) {
                    ext.compileSdk = 36
                }
            }
        }
    }
}
// ▲▲▲ FIN ▲▲▲

subprojects {
    project.evaluationDependsOn(":app")
}

tasks.register<Delete>("clean") {
    delete(rootProject.layout.buildDirectory)
}