import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'components/style/app_theme.dart';
import 'controllers/authentification_controller.dart';
import 'pages/public/onboarding/onboarding_accueil_page.dart';
import 'utils/identifiant_installation.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // Identifiant d'installation (statistiques de vues des fiches) : lu une
  // fois, avant le premier appel réseau. Ne lève jamais.
  await IdentifiantInstallation.charger();
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
      // L'application démarre sur l'écran de choix de l'onboarding
      // (Écran 1, portage de OnboardingAccueil.jsx) plutôt que
      // directement sur l'accueil public : un nouvel arrivant est
      // orienté entre "Rechercher un professionnel" et "Je suis
      // professionnel" avant d'atteindre PublicAcceuilPage — qui reste
      // à une navigation "Passer" près (voir OnboardingAccueilPage).
      home: const OnboardingAccueilPage(),
    );
  }
}