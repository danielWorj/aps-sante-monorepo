import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../controllers/authentification_controller.dart';
import 'public/login.dart';
import 'home_router_for_role.dart';

/// Point d'entrée réactif de l'app : bascule automatiquement entre
/// l'écran de connexion et l'espace correspondant au rôle de
/// l'utilisateur, en suivant [sessionControllerProvider].
///
/// À utiliser comme `home:` du `MaterialApp` dans main.dart, à la
/// place d'une navigation manuelle depuis `LoginScreen` : dès que
/// `SessionController.connecter()` ouvre une session, cet état se
/// propage ici automatiquement et remplace `LoginScreen` par
/// `HomeRouterForRole` sans code de navigation supplémentaire.
class AuthGate extends ConsumerWidget {
  const AuthGate({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final session = ref.watch(sessionControllerProvider);

    return session.when(
      loading: () => const _SplashScreen(),
      // Erreur lors de la restauration de session au démarrage
      // (réseau, 500…) : on retombe sur l'écran de connexion plutôt
      // que de bloquer l'app.
      error: (err, stack) => const LoginScreen(),
      data: (session) {
        if (session == null) {
          return const LoginScreen();
        }
        return HomeRouterForRole(role: session.utilisateur.role);
      },
    );
  }
}

class _SplashScreen extends StatelessWidget {
  const _SplashScreen();

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: Center(child: CircularProgressIndicator()),
    );
  }
}