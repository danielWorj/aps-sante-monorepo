import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'pages/public/onboarding/onboarding_accueil_page.dart';

void main() {
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

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'APS Santé',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: Colors.deepPurple),
      ),
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