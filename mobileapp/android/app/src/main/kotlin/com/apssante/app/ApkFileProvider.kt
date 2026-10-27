package com.apssante.app

import androidx.core.content.FileProvider

// FileProvider dédié aux APK de mise à jour : une sous-classe évite toute
// collision de déclaration avec les FileProvider des plugins (file_picker…).
class ApkFileProvider : FileProvider()
