import java.util.Properties

plugins {
    id("com.android.application")
    id("kotlin-android")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

// Release builds are signed with the author's existing key, kept outside this app in ../signing (never copied or committed).
// The key file is looked up next to keystore.properties. Without them, release builds fall back to the debug key.
val signingDir = rootProject.file("../../signing")
val signingProps = Properties().apply {
    val file = File(signingDir, "keystore.properties")
    if (file.exists()) file.inputStream().use { load(it) }
}
val releaseKey = signingProps.getProperty("storeFile")?.let { File(signingDir, File(it).name) }?.takeIf { it.exists() }

android {
    namespace = "com.novelbuilder.flutter"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = JavaVersion.VERSION_17.toString()
    }

    defaultConfig {
        // Not the old app's com.novelbuilder.app: this installs beside it instead of replacing it (and stranding its data).
        applicationId = "com.novelbuilder.flutter"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    signingConfigs {
        if (releaseKey != null) {
            create("release") {
                storeFile = releaseKey
                storePassword = signingProps.getProperty("storePassword")
                keyAlias = signingProps.getProperty("keyAlias")
                keyPassword = signingProps.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            signingConfig = signingConfigs.findByName("release") ?: signingConfigs.getByName("debug")
        }
    }
}

flutter {
    source = "../.."
}
