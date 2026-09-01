import 'package:flutter/material.dart';

import 'pages/public/publicAcceuil.dart';

void main() {
  runApp(const MyApp());
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