// lib/utils/mon_espace_navigation.dart
//
// Action partagée par la rubrique « Mon espace » de la barre de
// navigation basse publique ([AppBottomNav], voir
// components/navigation/app_bottom_nav.dart), qui remplace l'ancienne
// rubrique « À propos ».
//
// Règle métier :
//   - utilisateur déjà connecté -> on ouvre directement son espace
//     personnel, c'est-à-dire [HomeRouterForRole], qui affiche la
//     bonne "coquille" (Scaffold + SA PROPRE bottom navigation bar,
//     avec ses différentes pages) selon son rôle (patient, médecin,
//     ou autre) ;
//   - utilisateur non connecté -> on ouvre l'écran de connexion
//     ([LoginScreen]), qui bascule lui-même vers l'espace personnel
//     une fois la connexion réussie (voir [AuthGate] / main.dart pour
//     le point d'entrée global équivalent).
//
// [ouvrirMonEspace] lit directement le [ProviderContainer] ambiant
// (`ProviderScope.containerOf`) plutôt que d'exiger un `WidgetRef` :
// cela permet de l'appeler à l'identique depuis un `ConsumerState`
// (Assurancepage, Pharmaciepage, Centresantepage, DetailAssurance...)
// ou depuis un simple `State` classique (Medecinpage, urgence,
// apropos), sans avoir à convertir ces écrans en `ConsumerStatefulWidget`
// juste pour cette navigation.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../controllers/authentification_controller.dart';
import '../pages/home_router_for_role.dart';
import '../pages/public/login.dart';

/// Ouvre « Mon espace » : l'espace personnel de l'utilisateur (avec sa
/// propre bottom navigation bar) s'il est déjà connecté, sinon l'écran
/// de connexion.
void ouvrirMonEspace(BuildContext context) {
  final container = ProviderScope.containerOf(context, listen: false);
  final session = container.read(sessionControllerProvider).value;

  if (session != null) {
    // Déjà connecté : on ouvre directement son espace personnel.
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => HomeRouterForRole(role: session.utilisateur.role),
      ),
    );
    return;
  }

  // Non connecté : on ouvre l'écran de connexion, en lui fournissant
  // `onLoginSuccess`. Sans ce callback, LoginScreen n'a AUCUN moyen de
  // savoir qu'elle doit naviguer une fois la session ouverte (elle ne
  // fait que déclencher `SessionController.connecter`, qui met à jour
  // `sessionControllerProvider`, mais ne navigue jamais elle-même) :
  // c'était la cause du blocage sur l'écran de login après une
  // connexion pourtant réussie.
  Navigator.push(
    context,
    MaterialPageRoute(
      builder: (routeContext) => LoginScreen(
        onLoginSuccess: () {
          final nouvelleSession =
              container.read(sessionControllerProvider).value;
          if (nouvelleSession == null) return;
          // pushReplacement : on remplace l'écran de login par le
          // "shell" (Scaffold + bottom navigation bar) du rôle
          // connecté, pour ne pas laisser le login dans l'historique.
          Navigator.of(routeContext).pushReplacement(
            MaterialPageRoute(
              builder: (_) =>
                  HomeRouterForRole(role: nouvelleSession.utilisateur.role),
            ),
          );
        },
      ),
    ),
  );
}