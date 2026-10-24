import Flutter
import UIKit

@main
@objc class AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate {
  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  func didInitializeImplicitFlutterEngine(_ engineBridge: FlutterImplicitEngineBridge) {
    GeneratedPluginRegistrant.register(with: engineBridge.pluginRegistry)
    enregistrerCanalMiseAJour(engineBridge.pluginRegistry)
  }

  /// Canal aps/mise_a_jour (même nom que MainActivity.kt) : sur iPhone, seule
  /// la version installée est lue ; la mise à jour passe par l'App Store.
  private func enregistrerCanalMiseAJour(_ registre: FlutterPluginRegistry) {
    guard let registrar = registre.registrar(forPlugin: "MiseAJour") else { return }
    let canal = FlutterMethodChannel(name: "aps/mise_a_jour", binaryMessenger: registrar.messenger())
    canal.setMethodCallHandler { appel, resultat in
      switch appel.method {
      case "infosVersion":
        let infos = Bundle.main.infoDictionary ?? [:]
        let build = Int(infos["CFBundleVersion"] as? String ?? "") ?? 0
        resultat([
          "versionName": infos["CFBundleShortVersionString"] as? String ?? "—",
          "versionCode": build,
        ])
      default:
        resultat(FlutterMethodNotImplemented)
      }
    }
  }
}
