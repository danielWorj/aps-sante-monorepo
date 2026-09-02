import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'pages/public/publicAcceuil.dart';

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
      // L'application démarre directement sur l'écran d'accueil public.
      home: const PublicAcceuilPage(),
    );
  }
}