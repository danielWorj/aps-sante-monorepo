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
import '../pages/public/Medecinpage.dart' show medecinProviderContainer;
import '../pages/public/demande_rapide_page.dart';
import '../pages/public/login.dart';
import '../pages/public/utils/createassurancepage.dart';
import '../pages/public/utils/createcentresantepage.dart';
import '../pages/public/utils/createlaboratoirepage.dart';
import '../pages/public/utils/createmedecinpage.dart';
import '../pages/public/utils/createpharmaciepage.dart';

/// Ouvre la « Demande rapide » (RDV aléatoire) depuis l'espace public :
/// écran ouvert à tous, avec création du compte patient ou connexion sur
/// place (voir [DemandeRapidePage]).
void ouvrirDemandeRapide(BuildContext context) {
  Navigator.push(context, MaterialPageRoute(builder: (_) => const DemandeRapidePage()));
}

/// Ouvre « Mon espace » : l'espace personnel de l'utilisateur (avec sa
/// propre bottom navigation bar) s'il est déjà connecté, sinon l'écran
/// de connexion.
///
/// Attend la fin de la restauration de session du démarrage : un
/// utilisateur dont le jeton est persisté ne repasse jamais par la
/// connexion.
Future<void> ouvrirMonEspace(BuildContext context) async {
  final container = ProviderScope.containerOf(context, listen: false);
  final session = await attendreSession(container);
  if (!context.mounted) return;

  if (session != null) {
    // Déjà connecté : on ouvre directement son espace personnel.
    Navigator.push(
      context,
      MaterialPageRoute(
        // Session déjà ouverte : retour direct dans le dernier espace.
        builder: (_) => const AccueilCompte(),
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
              // Vraie connexion : « Choisir mon espace » s'il y en a plusieurs.
              builder: (_) => const AccueilCompte(choisir: true),
            ),
          );
        },
      ),
    ),
  );
}

/// Ouvre [destination] si une session est ouverte ; sinon affiche
/// [LoginScreen] et, une fois connecté, remplace le login par
/// [destination] pour que le professionnel ne perde pas son intention.
/// Évite qu'un visiteur remplisse toutes les étapes avant d'apprendre
/// à l'envoi que la route exige une connexion.
Future<void> ouvrirAvecSession(BuildContext context, WidgetBuilder destination) async {
  final container = ProviderScope.containerOf(context, listen: false);
  // Attendre la restauration du démarrage (jeton persisté).
  final session = await attendreSession(container);
  if (!context.mounted) return;
  if (session != null) {
    Navigator.of(context).push(MaterialPageRoute(builder: destination));
    return;
  }
  Navigator.of(context).push(
    MaterialPageRoute(
      builder: (routeContext) => LoginScreen(
        onLoginSuccess: () {
          if (container.read(sessionControllerProvider).value == null) return;
          Navigator.of(routeContext).pushReplacement(
            MaterialPageRoute(builder: destination),
          );
        },
      ),
    ),
  );
}

/// « Devenir médecin » : création de fiche (POST /medecins, publique).
/// Même [ProviderContainer] que l'annuaire, pour qu'il se rafraîchisse.
void ouvrirDevenirMedecin(BuildContext context) {
  Navigator.of(context).push(
    MaterialPageRoute(
      builder: (_) => CreateMedecinScreen(container: medecinProviderContainer),
    ),
  );
}

/// Déclaration d'une pharmacie / d'un centre de santé / d'une assurance :
/// ces routes exigent une session (connexion d'abord si besoin).
void ouvrirDeclarerPharmacie(BuildContext context) =>
    ouvrirAvecSession(context, (_) => const CreatePharmacieScreen());

void ouvrirDeclarerCentreSante(BuildContext context) =>
    ouvrirAvecSession(context, (_) => const CreateCentreSanteScreen());

void ouvrirDeclarerAssurance(BuildContext context) =>
    ouvrirAvecSession(context, (_) => const CreateAssuranceScreen());

void ouvrirDeclarerLaboratoire(BuildContext context) =>
    ouvrirAvecSession(context, (_) => const CreateLaboratoireScreen());
