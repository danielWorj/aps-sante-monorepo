// lib/repositories/paiement_repository.dart
//
// Consommation des routes de paiement Stripe (PaymentSheet natif) et
// Mobile Money (CamPay) — miroir de server/src/routes/paiement.routes.js. Même patron que
// rendez_vous_repository.dart : HTTP direct via `package:http`, aucun
// état applicatif, le [token] est fourni requête par requête.
//
// ⚠️ Ce repository ne décide JAMAIS qu'un rendez-vous est payé : seule
// la réponse de [obtenirStatut] (alimentée par les webhooks Stripe /
// CamPay côté serveur) fait foi.

import 'dart:convert';

import 'package:http/http.dart' as http;

import '../models/rendez_vous_models.dart' show DevisPaiement, lireNombre;
import '../utils/endpoint.dart';
// Même ApiException que les autres repositories du module rendez-vous.
import 'rendez_vous_repository.dart' show ApiException;

/// Réponse de POST /paiement/rendez-vous/:id/paiement-natif.
class PaymentSheetConfig {
  const PaymentSheetConfig({
    required this.clientSecret,
    required this.publishableKey,
  });

  final String clientSecret;

  /// Clé PUBLIQUE Stripe (pk_…), fournie par le serveur : rien en dur
  /// dans l'app, et la clé secrète (sk_…) n'y figure jamais.
  final String publishableKey;

  factory PaymentSheetConfig.fromJson(Map<String, dynamic> json) {
    final secret = json['client_secret'];
    final cle = json['publishable_key'];
    if (secret is! String || cle is! String) {
      throw const ApiException('Réponse de paiement invalide.');
    }
    return PaymentSheetConfig(clientSecret: secret, publishableKey: cle);
  }
}

/// Réponse de POST /paiement/rendez-vous/:id/paiement-campay.
///
/// Une [CollecteCampay] ne prouve JAMAIS un paiement : elle indique
/// seulement que la demande de validation est partie (ou a peut-être été
/// envoyée, voir [incertain]) vers le téléphone du payeur.
class CollecteCampay {
  const CollecteCampay({
    this.reference,
    this.operateur,
    this.ussdCode,
    this.incertain = false,
    this.dejaInitie = false,
  });

  /// Référence CamPay. `null` si l'issue est incertaine (202).
  final String? reference;

  /// « MTN » / « ORANGE », si connu.
  final String? operateur;

  /// Code USSD à composer en secours, si fourni par CamPay.
  final String? ussdCode;

  /// 202 : le serveur n'a pas pu confirmer l'envoi de la demande à
  /// l'opérateur. Elle a peut-être été reçue : ne pas en renvoyer une
  /// autre (risque de double débit), simplement attendre.
  final bool incertain;

  /// 200 : une tentative identique (même RDV, même numéro, < 2 min) était
  /// déjà en cours, le serveur la renvoie au lieu d'en créer une nouvelle.
  final bool dejaInitie;

  factory CollecteCampay.fromJson(Map<String, dynamic> json) {
    String? texte(String cle) {
      final v = json[cle];
      return v is String && v.isNotEmpty ? v : null;
    }

    return CollecteCampay(
      reference: texte('reference'),
      operateur: texte('operateur'),
      ussdCode: texte('ussd_code'),
      incertain: json['incertain'] == true,
      dejaInitie: json['deja_initie'] == true,
    );
  }
}

/// Décomposition d'un paiement — `paiement.decomposition` de
/// GET /paiement/rendez-vous/:id/paiement : total = honoraires (H) + frais
/// d'envoi + commission APS patient (CP). `null` côté [StatutPaiementRdv]
/// pour les transactions antérieures à la politique v2.
///
/// La commission médecin (CM) et le net médecin, que le serveur n'expose
/// qu'au médecin concerné et aux admins, ne sont volontairement pas lus
/// ici (D7).
class DecompositionPaiement {
  const DecompositionPaiement({
    required this.honoraires,
    required this.fraisEnvoi,
    this.commissionPatient = 0,
    required this.total,
  });

  final double honoraires;
  final double fraisEnvoi;

  /// Commission APS patient (CP). 0 pour une transaction sans ligne CP
  /// figée (D2) ou si le champ est absent.
  final double commissionPatient;
  final double total;

  /// `null` si [json] n'est pas un objet ou si H, les frais d'envoi ou le
  /// total manquent : on n'affiche jamais une décomposition à moitié
  /// connue. CP absente = 0 (transaction ancienne, D2).
  static DecompositionPaiement? tenterDepuis(Object? json) {
    if (json is! Map<String, dynamic>) return null;
    // Décimaux Prisma sérialisés en String : lireNombre accepte les deux.
    final honoraires = lireNombre(json['honoraires']);
    final fraisEnvoi = lireNombre(json['frais_envoi']);
    final total = lireNombre(json['total']);
    if (honoraires == null || fraisEnvoi == null || total == null) return null;
    return DecompositionPaiement(
      honoraires: honoraires,
      fraisEnvoi: fraisEnvoi,
      commissionPatient: lireNombre(json['commission_patient']) ?? 0,
      total: total,
    );
  }
}

/// Ligne d'une facture : `taux` est une FRACTION (0,02 = 2 %), `base`
/// vaut H quand un taux s'applique. `montant` est déjà arrondi par le
/// serveur : la somme des lignes égale [Facture.total]. Aucun calcul
/// n'est fait côté app.
class LigneFacture {
  const LigneFacture({
    required this.code,
    required this.libelle,
    required this.montant,
    this.base,
    this.taux,
    this.montantFixe,
  });

  /// `consultation` | `frais_agregateur` | `commission_aps`.
  final String code;
  final String libelle;
  final double montant;
  final double? base;
  final double? taux;
  final double? montantFixe;

  /// Taux en pourcentage pour l'affichage (0,02 → 2), `null` sans taux.
  double? get tauxEnPourcent => taux == null ? null : taux! * 100;

  /// `null` si le libellé ou le montant manque : la ligne est ignorée
  /// plutôt que d'afficher une facture incohérente.
  static LigneFacture? tenterDepuis(Object? json) {
    if (json is! Map<String, dynamic>) return null;
    final libelle = json['libelle'];
    final montant = lireNombre(json['montant']);
    if (libelle is! String || montant == null) return null;
    return LigneFacture(
      code: json['code'] is String ? json['code'] as String : '',
      libelle: libelle,
      montant: montant,
      base: lireNombre(json['base']),
      taux: lireNombre(json['taux']),
      montantFixe: lireNombre(json['montant_fixe']),
    );
  }
}

/// Bloc « consultation » de l'en-tête d'une facture.
class EnteteFacture {
  const EnteteFacture({
    required this.medecin,
    this.specialite,
    this.pays,
    this.ville,
    this.rdvId,
    this.dateCreneau,
  });

  final String medecin;
  final String? specialite;
  final String? pays;
  final String? ville;
  final String? rdvId;
  final DateTime? dateCreneau;

  factory EnteteFacture.fromJson(Object? json) {
    final j = json is Map<String, dynamic> ? json : const <String, dynamic>{};
    String? texte(String cle) {
      final v = j[cle];
      return v is String && v.isNotEmpty ? v : null;
    }

    final creneau = texte('date_creneau');
    return EnteteFacture(
      medecin: texte('medecin') ?? 'Médecin',
      specialite: texte('specialite'),
      pays: texte('pays'),
      ville: texte('ville'),
      rdvId: texte('rdv_id'),
      dateCreneau: creneau == null ? null : DateTime.tryParse(creneau),
    );
  }
}

/// Réponse de GET /paiement/rendez-vous/:id/facture.
///
/// - [estDevis] : aperçu AVANT paiement (`type = devis`, pas de numéro) ;
/// - [minimale] : facture d'une transaction antérieure à la v2 (une seule
///   ligne « Consultation », total = montant débité, D4) ;
/// - vue médecin (D7) : une seule ligne (la consultation H), sans CP ni
///   frais ni total payé : la même card l'affiche sans cas particulier.
/// `detail_admin` (CM, net médecin) n'est jamais lu dans l'app patient.
class Facture {
  const Facture({
    required this.type,
    required this.devise,
    required this.entete,
    required this.lignes,
    required this.total,
    this.numero,
    this.date,
    this.agregateur,
    this.statutPaiement,
    this.minimale = false,
    this.raisonMinimale,
  });

  final String type;
  final String? numero;
  final DateTime? date;
  final String devise;
  final String? agregateur;
  final String? statutPaiement;
  final EnteteFacture entete;
  final List<LigneFacture> lignes;
  final double total;
  final bool minimale;
  final String? raisonMinimale;

  bool get estDevis => type == 'devis';

  factory Facture.fromJson(Map<String, dynamic> json) {
    final total = lireNombre(json['total']);
    final brutes = json['lignes'];
    final lignes = <LigneFacture>[
      if (brutes is List)
        for (final l in brutes)
          if (LigneFacture.tenterDepuis(l) case final ligne?) ligne,
    ];
    // Pas de total ou pas de ligne : on refuse d'afficher une facture
    // vide ou fausse (le patient verrait un montant qui n'est pas le sien).
    if (total == null || lignes.isEmpty) {
      throw const ApiException('Facture invalide.');
    }
    String? texte(String cle) {
      final v = json[cle];
      return v is String && v.isNotEmpty ? v : null;
    }

    final date = texte('date');
    return Facture(
      type: texte('type') ?? 'facture',
      numero: texte('numero'),
      date: date == null ? null : DateTime.tryParse(date),
      devise: texte('devise') ?? 'xaf',
      agregateur: texte('agregateur'),
      statutPaiement: texte('statut_paiement'),
      entete: EnteteFacture.fromJson(json['entete']),
      lignes: lignes,
      total: total,
      minimale: json['minimale'] == true,
      raisonMinimale: texte('raison_minimale'),
    );
  }
}

/// Réponse de GET /paiement/rendez-vous/:id/paiement.
class StatutPaiementRdv {
  const StatutPaiementRdv({
    required this.statutRdv,
    this.statutPaiement,
    this.montant,
    this.devise,
    this.decomposition,
    this.tentativeCampayStatut,
    this.tentativeCampayOperateur,
  });

  final String statutRdv;

  /// `null` tant que le webhook Stripe n'a pas créé l'escrow.
  final String? statutPaiement;
  final num? montant;
  final String? devise;

  /// Détail honoraires / frais d'envoi renvoyé par le serveur ; `null`
  /// pour une transaction antérieure à la politique v2 (ou sans paiement).
  final DecompositionPaiement? decomposition;

  /// Statut de la DERNIÈRE tentative Mobile Money du RDV
  /// (`en_attente` | `reussie` | `echouee` | `remboursee`), ou `null` si
  /// le RDV n'en a aucune (`tentative_campay` absent ou null).
  final String? tentativeCampayStatut;

  /// Opérateur de cette tentative (« MTN » / « ORANGE »), si connu.
  final String? tentativeCampayOperateur;

  /// Vrai uniquement quand le serveur a enregistré le paiement.
  bool get estPaye => statutPaiement == 'reussie';

  /// Vrai quand la dernière tentative Mobile Money a été refusée ou a
  /// expiré : inutile d'attendre davantage, le patient peut réessayer.
  bool get tentativeCampayEchouee => tentativeCampayStatut == 'echouee';

  factory StatutPaiementRdv.fromJson(Map<String, dynamic> json) {
    final p = json['paiement'];
    final paiement = p is Map<String, dynamic> ? p : null;
    final t = json['tentative_campay'];
    final tentative = t is Map<String, dynamic> ? t : null;
    return StatutPaiementRdv(
      statutRdv: '${json['statut_rdv']}',
      statutPaiement: paiement?['statut'] as String?,
      // Prisma Decimal est sérialisé en String ("5000") → parse tolérant.
      montant: paiement == null ? null : num.tryParse('${paiement['montant']}'),
      devise: paiement?['devise'] as String?,
      decomposition: DecompositionPaiement.tenterDepuis(paiement?['decomposition']),
      tentativeCampayStatut: tentative?['statut'] as String?,
      tentativeCampayOperateur: tentative?['operateur'] as String?,
    );
  }
}

class PaiementRepository {
  static const Duration _timeout = Duration(seconds: 15);

  /// Le serveur patiente jusqu'à 15 s sur CamPay avant de répondre (202
  /// « issue incertaine » comprise) : le client doit attendre plus longtemps
  /// que lui, sinon il abandonne juste avant la réponse.
  static const Duration _timeoutCollecte = Duration(seconds: 40);

  Map<String, String> _entetes(String token) => {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $token',
      };

  dynamic _decoder(http.Response r) {
    if (r.statusCode < 200 || r.statusCode >= 300) {
      var message = 'Erreur ${r.statusCode}';
      try {
        final corps = jsonDecode(r.body);
        if (corps is Map && corps['message'] is String) {
          message = corps['message'] as String;
        }
      } catch (_) {}
      throw ApiException(message, statusCode: r.statusCode);
    }
    return r.body.isEmpty ? null : jsonDecode(r.body);
  }

  /// POST /paiement/rendez-vous/:id/paiement-natif
  ///
  /// Idempotent côté serveur : rouvrir la feuille de paiement pour un
  /// RDV déjà en cours de règlement renvoie le même `client_secret`.
  Future<PaymentSheetConfig> creerPaymentSheet({
    required String rdvId,
    required String token,
  }) async {
    final r = await http
        .post(
          Uri.parse(ApiRealEndpoints.paiementRdvNatif(rdvId)),
          headers: _entetes(token),
          body: '{}',
        )
        .timeout(_timeout);
    return PaymentSheetConfig.fromJson(_decoder(r) as Map<String, dynamic>);
  }

  /// GET /paiement/rendez-vous/:id/paiement
  Future<StatutPaiementRdv> obtenirStatut({
    required String rdvId,
    required String token,
  }) async {
    final r = await http
        .get(
          Uri.parse(ApiRealEndpoints.statutPaiementRdv(rdvId)),
          headers: _entetes(token),
        )
        .timeout(_timeout);
    return StatutPaiementRdv.fromJson(_decoder(r) as Map<String, dynamic>);
  }

  /// GET /paiement/rendez-vous/:id/devis?agregateur=stripe|campay
  ///
  /// Lecture seule : aucun montant n'est envoyé, le serveur recalcule
  /// tout. Erreurs : 400 (agrégateur invalide), 409 (RDV non payable ou
  /// déjà payé), 503 (barème non saisi, message serveur à afficher) →
  /// toutes levées en [ApiException] avec le message du serveur.
  Future<DevisPaiement> obtenirDevis({
    required String rdvId,
    required String agregateur,
    required String token,
  }) async {
    final uri = Uri.parse(ApiRealEndpoints.devisPaiementRdv(rdvId))
        .replace(queryParameters: {'agregateur': agregateur});
    final r = await http.get(uri, headers: _entetes(token)).timeout(_timeout);
    final corps = _decoder(r);
    if (corps is! Map<String, dynamic>) {
      throw const ApiException('Réponse de devis invalide.');
    }
    return DevisPaiement.fromJson(corps);
  }

  /// GET /paiement/rendez-vous/:id/facture[?agregateur=stripe|campay]
  ///
  /// Lecture seule : aucun montant n'est envoyé, le serveur recalcule
  /// tout. RDV payé : facture du paiement abouti ([agregateur] ignoré).
  /// RDV non payé : aperçu avant paiement, [agregateur] obligatoire (400
  /// sinon). Erreurs (409 `RDV_NON_PAYE` pour un médecin, 503 barème
  /// absent, 404…) levées en [ApiException] avec le message du serveur.
  Future<Facture> obtenirFacture({
    required String rdvId,
    required String token,
    String? agregateur,
  }) async {
    final r = await http
        .get(
          Uri.parse(
            ApiRealEndpoints.facturePaiementRdv(rdvId, agregateur: agregateur),
          ),
          headers: _entetes(token),
        )
        .timeout(_timeout);
    final corps = _decoder(r);
    if (corps is! Map<String, dynamic>) {
      throw const ApiException('Réponse de facture invalide.');
    }
    return Facture.fromJson(corps);
  }

  /// POST /paiement/rendez-vous/:id/paiement-campay
  ///
  /// N'envoie que `{numero}` : le montant est recalculé par le serveur.
  /// Les 200 (déjà initié), 201 (créé) et 202 (issue incertaine) sont tous
  /// des 2xx et passent donc par [_decoder] ; c'est [CollecteCampay]
  /// (`incertain`, `dejaInitie`) qui les distingue.
  ///
  /// ⚠️ Ne confirme RIEN : lire ensuite [obtenirStatut].
  Future<CollecteCampay> demanderPaiementCampay({
    required String rdvId,
    required String numero,
    required String token,
  }) async {
    final r = await http
        .post(
          Uri.parse(ApiRealEndpoints.paiementRdvCampay(rdvId)),
          headers: _entetes(token),
          body: jsonEncode({'numero': numero}),
        )
        .timeout(_timeoutCollecte);
    final corps = _decoder(r);
    if (corps is! Map<String, dynamic>) {
      throw const ApiException('Réponse de paiement invalide.');
    }
    return CollecteCampay.fromJson(corps);
  }
}