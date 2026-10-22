import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'components/style/app_theme.dart';
import 'controllers/authentification_controller.dart';
import 'pages/mise_a_jour/veille_mise_a_jour.dart';
import 'pages/pilote_push.dart';
import 'pages/public/onboarding/onboarding_accueil_page.dart';
import 'pages/verrou/veille_connexion_web.dart';
import 'pages/verrou/verrou_application.dart';
import 'services/pays_utilisateur_service.dart';
import 'services/push_service.dart';
import 'utils/api_client.dart';
import 'utils/identifiant_installation.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // Identifiant d'installation (statistiques de vues des fiches) : lu une
  // fois, avant le premier appel réseau. Ne lève jamais.
  await IdentifiantInstallation.charger();
  // Notifications push (Firebase) : sans configuration, simplement désactivées.
  await PushService.initialiser();
  runApp(
    // ProviderScope DOIT envelopper toute l'app dès la racine : tous les
    // écrans Riverpod (AssurancePage, PharmaciePage, CentreSantePage,
    // AssuranceDetailPage, MedecinPage...) utilisent ConsumerState /
    // ref.watch, qui lèvent "Bad state: No ProviderScope found" sans lui.
    const ProviderScope(
      child: MyApp(),
    ),
  );
}

class MyApp extends ConsumerStatefulWidget {
  const MyApp({super.key});

  @override
  ConsumerState<MyApp> createState() => _MyAppState();
}

/// Session : restaurée DÈS le démarrage (les providers Riverpod sont
/// paresseux — sans cette lecture, la restauration ne commençait qu'au
/// premier accès à « Mon espace », qui voyait alors une session encore
/// vide et renvoyait vers la connexion). Au retour au premier plan,
/// l'access token est renouvelé s'il a expiré pendant la mise en veille.
class _MyAppState extends ConsumerState<MyApp> with WidgetsBindingObserver {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    ref.read(sessionControllerProvider);
    // Pays de l'utilisateur (annuaires ouverts sur son pays) : détecté une
    // fois au démarrage, puis affiné par le pays du compte à la connexion.
    PaysUtilisateurService.instance.initialiser(
      client: ref.read(apiClientProvider),
      paysCompte: ref.read(authUtilisateurProvider)?.paysId,
    );
    ref.listenManual(authUtilisateurProvider, (_, utilisateur) {
      PaysUtilisateurService.instance.definirPaysCompte(utilisateur?.paysId);
    });
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState etat) {
    if (etat == AppLifecycleState.resumed) {
      ref.read(sessionControllerProvider.notifier).verifierFraicheur();
    }
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'APS Santé',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light,
      // Clés globales : le pilote des notifications push ouvre la page des
      // rendez-vous et affiche ses bandeaux hors de tout BuildContext.
      navigatorKey: cleNavigateurApp,
      scaffoldMessengerKey: cleMessagerApp,
      // L'application démarre sur l'écran de choix de l'onboarding
      // (Écran 1, portage de OnboardingAccueil.jsx) plutôt que
      // directement sur l'accueil public : un nouvel arrivant est
      // orienté entre "Rechercher un professionnel" et "Je suis
      // professionnel" avant d'atteindre PublicAcceuilPage — qui reste
      // à une navigation "Passer" près (voir OnboardingAccueilPage).
      home: const OnboardingAccueilPage(),
      // Au-dessus de tous les écrans : verrouillage par code PIN / empreinte,
      // validation des connexions web demandées depuis un ordinateur, et
      // proposition des mises à jour de l'application (APK hors store).
      builder: (context, child) => VerrouApplication(
        child: VeilleConnexionWeb(
          child: VeilleMiseAJour(
            child: PilotePush(child: child ?? const SizedBox.shrink()),
          ),
        ),
      ),
    );
  }
}