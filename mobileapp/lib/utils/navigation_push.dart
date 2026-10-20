// lib/utils/navigation_push.dart
//
// Ouverture de la bonne page quand l'utilisateur touche une notification
// push : la page des rendez-vous (ou des demandes, des avis) de l'espace
// PATIENT ou MÉDECIN selon la notification.
//
// Les shells (PatientHomeShell, MedecinHomeShell) écoutent
// [demandeOngletPush] et basculent sur l'onglet demandé ; PilotePush
// (pages/pilote_push.dart) ouvre le shell s'il n'est pas affiché.

import 'package:flutter/widgets.dart';

enum EspacePush { patient, medecin }

/// Onglet demandé par une notification touchée.
class DemandeOngletPush {
  final EspacePush espace;

  /// `rendez_vous` | `demandes` | `avis` | `notifications` (voir
  /// cibleNotification côté serveur).
  final String cible;

  const DemandeOngletPush(this.espace, this.cible);
}

final ValueNotifier<DemandeOngletPush?> demandeOngletPush = ValueNotifier(null);

/// Route de chaque shell actuellement monté (pour y revenir au toucher).
final Map<EspacePush, Route<dynamic>> routesShellsPush = {};

const _typesMedecin = {
  'rdv_paye',
  'offre_rdv_nouvelle',
  'offre_rdv_candidature_retenue',
  'offre_rdv_candidature_non_retenue',
  'avis_medecin_publie',
};

const _typesPatient = {
  'rdv_accepte',
  'rdv_confirmation_expiree',
  'offre_rdv_reponse',
  'offre_rdv_expiree',
  'avis_medecin_invitation',
  'avis_medecin_reponse',
};

/// Espace visé par la notification ; null = celui du compte connecté
/// (notifications communes aux deux parties : reprogrammation…).
EspacePush? espaceDeNotification(Map<String, dynamic> donnees) {
  final role = donnees['role'];
  if (role == 'patient') return EspacePush.patient;
  if (role == 'medecin') return EspacePush.medecin;
  final type = donnees['type'];
  if (_typesMedecin.contains(type)) return EspacePush.medecin;
  if (_typesPatient.contains(type)) return EspacePush.patient;
  return null;
}

/// Index d'onglet de PatientHomeShell : Rendez-vous (1) ou Demande (2).
int ongletPatientPush(String cible) => cible == 'demandes' ? 2 : 1;

/// Index d'onglet de MedecinHomeShell : Rendez-vous (0), Demandes (1),
/// Activité (4, vue des avis).
int ongletMedecinPush(String cible) => switch (cible) {
      'demandes' => 1,
      'avis' => 4,
      _ => 0,
    };
