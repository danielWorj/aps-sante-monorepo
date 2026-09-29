// lib/controllers/paiement_controller.dart
//
// Orchestration du paiement d'un rendez-vous :
//   - carte bancaire : PaymentSheet Stripe ;
//   - Mobile Money   : collecte CamPay (demande de validation sur le
//                      téléphone) + polling adapté.
//
// Volontairement SANS provider Riverpod : l'app utilise plusieurs
// ProviderContainer distincts (rendezVousProviderContainer,
// medecinProviderContainer…) qui ne partagent pas la session. Le jeton
// est donc fourni par l'appelant via un [ExecuteurAuthentifie], ce qui
// fonctionne quel que soit le container (ou l'absence de container).

import 'dart:async' show TimeoutException;

import 'package:flutter/material.dart' show ThemeMode;
import 'package:flutter_stripe/flutter_stripe.dart'
    show FailureCode, SetupPaymentSheetParameters, Stripe, StripeException;

import '../repositories/paiement_repository.dart';
import '../repositories/rendez_vous_repository.dart' show ApiException;
import '../utils/mobile_money.dart';

/// Exécute un appel authentifié en lui fournissant un access token.
///
/// - Sous le ProviderScope (ex. portail patient) :
///   `ref.read(sessionControllerProvider.notifier).appelAuthentifie`
///   (rejoue l'appel après un refresh silencieux si le token a expiré).
/// - Avec un token brut (ex. juste après une création de compte dans
///   RendezVousPage) : [executeurAvecTokenFixe].
typedef ExecuteurAuthentifie = Future<T> Function<T>(
  Future<T> Function(String accessToken) appel,
);

/// [ExecuteurAuthentifie] qui utilise toujours le même [token].
ExecuteurAuthentifie executeurAvecTokenFixe(String token) {
  return <T>(Future<T> Function(String accessToken) appel) => appel(token);
}

/// Message affiché quand on tente de payer (ou d'attendre le paiement
/// d') un rendez-vous déjà annulé.
const String rdvAnnuleMessage =
    'Ce rendez-vous a été annulé : il n\'est plus possible de le payer. '
    'Si un montant a été débité, il vous sera remboursé.';

/// Erreur de paiement au message directement affichable au patient.
class PaiementException implements Exception {
  const PaiementException(this.message);
  final String message;

  @override
  String toString() => message;
}

/// Ouvre la PaymentSheet Stripe pour [rdvId].
///
/// Retourne `true` si le patient a validé la feuille, `false` s'il l'a
/// fermée sans payer. Lève [PaiementException] (message lisible) ou
/// [ApiException] en cas d'erreur.
///
/// ⚠️ `true` NE VEUT PAS DIRE « RDV confirmé » : seul le webhook Stripe
/// confirme le rendez-vous côté serveur. Appeler ensuite
/// [attendreConfirmationPaiement].
Future<bool> payerAvecPaymentSheet(
  PaiementRepository repo, {
  required String rdvId,
  required ExecuteurAuthentifie executer,
}) async {
  final cfg = await executer(
    (token) => repo.creerPaymentSheet(rdvId: rdvId, token: token),
  );

  try {
    // La clé publique vient du serveur : pas de clé en dur dans l'app.
    Stripe.publishableKey = cfg.publishableKey;
    await Stripe.instance.applySettings();

    await Stripe.instance.initPaymentSheet(
      paymentSheetParameters: SetupPaymentSheetParameters(
        paymentIntentClientSecret: cfg.clientSecret,
        merchantDisplayName: 'APS Santé',
        style: ThemeMode.light,
      ),
    );

    await Stripe.instance.presentPaymentSheet();
    return true;
  } on StripeException catch (e) {
    if (e.error.code == FailureCode.Canceled) return false;
    throw PaiementException(
      e.error.localizedMessage ??
          e.error.message ??
          'Le paiement a échoué. Veuillez réessayer.',
    );
  }
}

/// Le webhook Stripe est la SEULE source de vérité : on interroge donc
/// l'API jusqu'à voir le paiement « reussie » (comme PaiementSucces.jsx
/// côté web — le webhook peut arriver après la fin de la PaymentSheet).
///
/// Retourne `null` si le paiement n'est pas encore confirmé au bout des
/// tentatives (l'UI propose alors de revérifier plus tard : ce n'est pas
/// un échec, le webhook peut simplement être en retard).
Future<StatutPaiementRdv?> attendreConfirmationPaiement(
  PaiementRepository repo, {
  required String rdvId,
  required ExecuteurAuthentifie executer,
  int tentativesMax = 12,
  Duration delai = const Duration(milliseconds: 1500),
}) async {
  for (var i = 0; i < tentativesMax; i++) {
    StatutPaiementRdv? statut;
    try {
      statut = await executer(
        (token) => repo.obtenirStatut(rdvId: rdvId, token: token),
      );
    } on ApiException catch (e) {
      // Erreurs définitives : inutile de réessayer.
      if (e.statusCode == 403 || e.statusCode == 404) rethrow;
    } catch (_) {
      // Erreur réseau transitoire : on retente.
    }

    if (statut != null) {
      // Rendez-vous annulé entre-temps : le serveur n'encaisse plus rien
      // pour lui (et rembourse un éventuel paiement arrivé trop tard).
      // Inutile d'attendre une confirmation qui ne viendra jamais.
      if (statut.statutRdv == 'annule') {
        throw const PaiementException(rdvAnnuleMessage);
      }
      if (statut.estPaye) return statut;
    }
    if (i < tentativesMax - 1) await Future<void>.delayed(delai);
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────
// Mobile Money (CamPay)
// ─────────────────────────────────────────────────────────────────────

/// Détecte un refus « rendez-vous annulé », qu'il vienne du polling
/// ([rdvAnnuleMessage]) ou du serveur (409 sur POST …/paiement-campay).
bool estErreurRdvAnnule(Object e) {
  final texte = '$e';
  return texte == rdvAnnuleMessage || texte.contains('a été annulé');
}

/// Envoie la demande de validation Mobile Money au [numero] (numéro
/// saisi, normalisé ici au format CamPay `2376XXXXXXXX`).
///
/// Lève [PaiementException] (message lisible) si le numéro est invalide,
/// ou [ApiException] si le serveur refuse (429 : trop de tentatives, 409 :
/// RDV annulé, 400/502 : refus CamPay…).
///
/// Un timeout CLIENT est traité comme une issue incertaine (`incertain`)
/// et non comme une erreur : la demande a pu partir. Rejouer risquerait un
/// double débit, alors que le polling ([attendreConfirmationMobileMoney])
/// verra le résultat de la tentative déjà créée.
///
/// ⚠️ Ne confirme RIEN : enchaîner avec
/// [attendreConfirmationMobileMoney].
Future<CollecteCampay> lancerCollecteMobileMoney(
  PaiementRepository repo, {
  required String rdvId,
  required String numero,
  required ExecuteurAuthentifie executer,
}) async {
  final normalise = normaliserNumeroCM(numero);
  if (normalise == null) {
    throw const PaiementException(
      'Saisissez un numéro camerounais valide (format 6XXXXXXXX).',
    );
  }
  try {
    return await executer(
      (token) => repo.demanderPaiementCampay(
        rdvId: rdvId,
        numero: normalise,
        token: token,
      ),
    );
  } on TimeoutException {
    return const CollecteCampay(incertain: true);
  }
}

/// Issue du polling Mobile Money.
enum IssueMobileMoney {
  /// Le SERVEUR a enregistré le paiement (`paiement.statut == 'reussie'`).
  reussie,

  /// Refus ou expiration de la dernière tentative
  /// (`tentative_campay.statut == 'echouee'`) : le patient peut réessayer.
  echouee,

  /// Aucune réponse définitive dans le temps imparti. Ce n'est PAS un
  /// échec : le patient peut encore valider, on propose de revérifier.
  delaiDepasse,

  /// Le polling a été interrompu par l'appelant ([doitContinuer]).
  interrompue,
}

/// Interroge le serveur jusqu'à connaître l'issue d'une collecte Mobile
/// Money. Contrairement à [attendreConfirmationPaiement] (~18 s, suffisant
/// pour un webhook Stripe), on laisse ~90 s (30 × 3 s, comme le web) : le
/// temps de saisir son code secret sur le téléphone.
///
/// S'arrête :
/// - sur `reussie` → [IssueMobileMoney.reussie] ;
/// - sur `tentative_campay.statut == 'echouee'` → [IssueMobileMoney.echouee] ;
/// - sur RDV `annule` → lève [PaiementException] ([rdvAnnuleMessage]) ;
/// - au bout des tentatives → [IssueMobileMoney.delaiDepasse].
///
/// Les erreurs 403/404 sont relancées (définitives) ; les autres erreurs
/// (réseau, 5xx) sont transitoires et le polling continue.
///
/// [doitContinuer] permet à l'UI de stopper la boucle (fenêtre fermée) :
/// une boucle Dart n'est pas liée au cycle de vie d'un widget.
Future<IssueMobileMoney> attendreConfirmationMobileMoney(
  PaiementRepository repo, {
  required String rdvId,
  required ExecuteurAuthentifie executer,
  int tentativesMax = 30,
  Duration delai = const Duration(seconds: 3),
  bool Function()? doitContinuer,
}) async {
  for (var i = 0; i < tentativesMax; i++) {
    // Délai AVANT chaque lecture (comme le web) : la collecte vient d'être
    // lancée, une lecture immédiate ne montrerait rien de neuf.
    await Future<void>.delayed(delai);
    if (doitContinuer != null && !doitContinuer()) {
      return IssueMobileMoney.interrompue;
    }

    StatutPaiementRdv? statut;
    try {
      statut = await executer(
        (token) => repo.obtenirStatut(rdvId: rdvId, token: token),
      );
    } on ApiException catch (e) {
      if (e.statusCode == 403 || e.statusCode == 404) rethrow;
    } catch (_) {
      // Erreur réseau transitoire : on retente.
    }
    if (doitContinuer != null && !doitContinuer()) {
      return IssueMobileMoney.interrompue;
    }

    if (statut != null) {
      // RDV annulé d'abord (comme attendreConfirmationPaiement) : un
      // paiement arrivé trop tard est remboursé, ce n'est pas un succès.
      if (statut.statutRdv == 'annule') {
        throw const PaiementException(rdvAnnuleMessage);
      }
      if (statut.estPaye) return IssueMobileMoney.reussie;
      if (statut.tentativeCampayEchouee) return IssueMobileMoney.echouee;
    }
  }
  return IssueMobileMoney.delaiDepasse;
}
