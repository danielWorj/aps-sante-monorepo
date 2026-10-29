// lib/controllers/mise_a_jour_controller.dart
//
// État de l'écran « Mises à jour » (pages/mise_a_jour/) et de la proposition
// automatique au démarrage (VeilleMiseAJour) : vérification de la version
// publiée, téléchargement avec progression, puis installation.
//
// Déploiement OTA (réglages de la version au back-office) :
//   - build minimal requis : en dessous, l'application est bloquée sur
//     l'écran « Mise à jour obligatoire » ;
//   - déploiement progressif : seuls les appareils du lot (0-99) inférieur au
//     pourcentage se voient proposer la version d'office ; les autres la
//     trouvent dans Paramètres > Mises à jour ;
//   - pré-téléchargement silencieux sur Wi-Fi (ou tout réseau si la mise à
//     jour est obligatoire) : l'installation est immédiate quand l'utilisateur
//     accepte ;
//   - nouvelle vérification au retour au premier plan après [_intervalle].

import 'dart:io';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../services/mise_a_jour_service.dart';

enum PhaseMiseAJour {
  /// Appareil non Android : pas de mise à jour hors store.
  indisponible,
  verification,
  aJour,
  disponible,
  telechargement,
  pret,
  erreur,
}

class EtatMiseAJour {
  const EtatMiseAJour({
    this.phase = PhaseMiseAJour.verification,
    this.installee,
    this.publiee,
    this.lot,
    this.recus = 0,
    this.total = 0,
    this.fichier,
    this.erreur,
    this.automatique = false,
    this.autorisationDemandee = false,
    this.installationLancee = false,
  });

  final PhaseMiseAJour phase;
  final VersionInstallee? installee;
  final VersionPubliee? publiee;

  /// Lot de déploiement de l'appareil (0-99, MiseAJourService.lotDeploiement).
  final int? lot;

  final int recus;
  final int total;
  final File? fichier;
  final String? erreur;

  /// Téléchargement lancé par l'application elle-même (pré-téléchargement) :
  /// l'installateur n'est pas ouvert à la fin, la mise à jour est proposée.
  final bool automatique;

  /// L'utilisateur a été envoyé dans les réglages « installer des applis
  /// inconnues » : au retour, l'installation est relancée.
  final bool autorisationDemandee;

  /// L'installateur Android a été ouvert. En cas de succès, Android arrête
  /// l'application pour la remplacer : la voir revenir au premier plan avec
  /// cet indicateur signifie que la mise à jour n'a pas été installée.
  final bool installationLancee;

  /// Une version plus récente que celle installée est publiée.
  bool get nouvelleVersion {
    final p = publiee?.build;
    final i = installee?.build;
    return p != null && i != null && p > i;
  }

  /// Android n'installe par-dessus que si le versionCode complet est
  /// supérieur : un build plus récent mais d'une autre architecture
  /// (APK universelle 3 face à une arm64 2002) serait refusé.
  bool get installable {
    final p = publiee?.versionCode;
    final i = installee?.code;
    return p == null || i == null || p > i;
  }

  /// Le build installé est sous le minimum requis : l'application est bloquée
  /// jusqu'à la mise à jour.
  bool get obligatoire {
    final minimum = publiee?.buildMinimum;
    final i = installee?.build;
    return nouvelleVersion && minimum != null && i != null && i < minimum;
  }

  /// L'appareil fait partie du déploiement progressif (toujours vrai pour
  /// une mise à jour obligatoire).
  bool get dansDeploiement {
    if (obligatoire) return true;
    final p = publiee;
    return p != null && (lot ?? 0) < p.pourcentageDeploiement;
  }

  double? get progression => total > 0 ? (recus / total).clamp(0, 1).toDouble() : null;

  EtatMiseAJour copyWith({
    PhaseMiseAJour? phase,
    VersionInstallee? installee,
    VersionPubliee? publiee,
    int? lot,
    int? recus,
    int? total,
    File? fichier,
    String? erreur,
    bool? automatique,
    bool? autorisationDemandee,
    bool? installationLancee,
  }) {
    return EtatMiseAJour(
      phase: phase ?? this.phase,
      installee: installee ?? this.installee,
      publiee: publiee ?? this.publiee,
      lot: lot ?? this.lot,
      recus: recus ?? this.recus,
      total: total ?? this.total,
      fichier: fichier ?? this.fichier,
      erreur: erreur,
      automatique: automatique ?? this.automatique,
      autorisationDemandee: autorisationDemandee ?? this.autorisationDemandee,
      installationLancee: installationLancee ?? this.installationLancee,
    );
  }
}

/// Motifs renvoyés par MiseAJourService.motifRefus (MainActivity.analyserApk).
const _messagesRefus = {
  'illisible': 'Le fichier téléchargé est incomplet ou endommagé. Relancez le téléchargement.',
  'paquet': 'Ce fichier n’est pas une mise à jour de cette application : il ne peut pas la remplacer. '
      'Contactez le support APS Santé.',
  'version': 'Cette version ne peut pas remplacer celle installée : son numéro de version Android est '
      'inférieur ou égal. Une version corrigée sera publiée prochainement.',
  'signature': 'Cette version n’est pas signée avec la même clé que l’application installée : Android refuse '
      'de la remplacer. Désinstallez ApSa puis installez la nouvelle version depuis le site APS Santé.',
};

final miseAJourServiceProvider = Provider<MiseAJourService>((ref) => MiseAJourService());

class MiseAJourController extends Notifier<EtatMiseAJour> {
  /// Délai après lequel un retour au premier plan relance la vérification
  /// (application laissée ouverte plusieurs jours).
  static const _intervalle = Duration(hours: 6);

  bool _annule = false;
  DateTime? _derniereVerification;

  MiseAJourService get _service => ref.read(miseAJourServiceProvider);

  /// Sur iPhone, la mise à jour passe par un lien (App Store / TestFlight).
  bool get estIos => _service.estIos;

  @override
  EtatMiseAJour build() {
    if (!_service.disponible) return const EtatMiseAJour(phase: PhaseMiseAJour.indisponible);
    Future.microtask(verifier);
    return const EtatMiseAJour();
  }

  Future<void> verifier() async {
    final phase = state.phase;
    if (phase == PhaseMiseAJour.indisponible || phase == PhaseMiseAJour.telechargement) return;
    state = state.copyWith(phase: PhaseMiseAJour.verification);
    try {
      final installee = state.installee ?? await _service.versionInstallee();
      final lot = state.lot ?? await _service.lotDeploiement();
      final publiee = await _service.versionPubliee();
      _derniereVerification = DateTime.now();
      final etat = EtatMiseAJour(installee: installee, publiee: publiee, lot: lot);
      // Un fichier déjà téléchargé pour cette version reste installable.
      final dejaPret = state.fichier != null && state.publiee?.id == publiee?.id;
      // Pré-téléchargement : décidé avant de publier l'état, pour que la
      // veille ne propose pas un téléchargement déjà en route.
      final prete = etat.nouvelleVersion && etat.installable && etat.dansDeploiement;
      final automatique = !estIos && !dejaPret && prete && (etat.obligatoire || await _service.reseauNonFacture());
      state = etat.copyWith(
        phase: !etat.nouvelleVersion
            ? PhaseMiseAJour.aJour
            : dejaPret
                ? PhaseMiseAJour.pret
                : PhaseMiseAJour.disponible,
        fichier: dejaPret ? state.fichier : null,
        automatique: automatique || (dejaPret && state.automatique),
        erreur: etat.nouvelleVersion && !etat.installable ? _messagesRefus['version'] : null,
      );
      if (automatique) telecharger(automatique: true);
    } catch (_) {
      state = state.copyWith(
        phase: PhaseMiseAJour.erreur,
        erreur: 'Impossible de vérifier les mises à jour. Vérifiez votre connexion internet.',
      );
    }
  }

  /// [automatique] : pré-téléchargement lancé par l'application, sans
  /// installation à la fin ni message d'erreur (sauf mise à jour obligatoire).
  /// Appelé par l'utilisateur pendant un pré-téléchargement, il le reprend à
  /// son compte : l'installateur s'ouvrira à la fin.
  Future<void> telecharger({bool automatique = false}) async {
    final version = state.publiee;
    if (version == null) return;
    if (state.phase == PhaseMiseAJour.telechargement) {
      if (!automatique && state.automatique) state = state.copyWith(automatique: false);
      return;
    }
    // iPhone : pas de fichier à installer, on ouvre l'App Store / TestFlight.
    if (estIos) {
      try {
        await _service.ouvrirLienIos(version);
      } catch (_) {
        state = state.copyWith(erreur: 'Impossible d’ouvrir l’App Store. Réessayez.');
      }
      return;
    }
    // Inutile de télécharger une APK qu'Android refusera d'installer.
    if (!state.installable) {
      state = state.copyWith(erreur: _messagesRefus['version']);
      return;
    }
    _annule = false;
    state = state.copyWith(
      phase: PhaseMiseAJour.telechargement,
      recus: 0,
      total: version.taille ?? 0,
      automatique: automatique,
    );
    try {
      final fichier = await _service.telecharger(
        version,
        annule: () => _annule,
        onProgression: (recus, total) => state = state.copyWith(recus: recus, total: total),
      );
      state = state.copyWith(phase: PhaseMiseAJour.pret, fichier: fichier);
      if (!state.automatique) await installer();
    } on TelechargementAnnule {
      state = state.copyWith(phase: PhaseMiseAJour.disponible, recus: 0, automatique: false);
    } catch (e) {
      final silencieux = state.automatique && !state.obligatoire;
      state = state.copyWith(
        phase: PhaseMiseAJour.disponible,
        automatique: false,
        erreur: silencieux
            ? null
            : e is EmpreinteInvalide
                ? _messagesRefus['illisible']
                : 'Le téléchargement a été interrompu. Vérifiez votre connexion et réessayez : '
                    'il reprendra là où il s’était arrêté.',
      );
    }
  }

  void annulerTelechargement() => _annule = true;

  /// Ouvre l'installateur ; si ApSa n'a pas encore le droit d'installer des
  /// applications, ouvre d'abord le réglage correspondant.
  Future<void> installer() async {
    final fichier = state.fichier;
    if (fichier == null) return;
    try {
      final refus = await _service.motifRefus(fichier);
      if (refus != null) {
        final message = _messagesRefus[refus] ?? 'Cette mise à jour ne peut pas être installée.';
        if (refus == 'illisible') {
          await fichier.delete().catchError((_) => fichier);
          // Fichier écarté : retour à « disponible » pour relancer le téléchargement.
          state = EtatMiseAJour(
            phase: PhaseMiseAJour.disponible,
            installee: state.installee,
            publiee: state.publiee,
            lot: state.lot,
            erreur: message,
          );
        } else {
          state = state.copyWith(erreur: message, autorisationDemandee: false);
        }
        return;
      }
      if (!await _service.peutInstaller()) {
        state = state.copyWith(autorisationDemandee: true);
        await _service.ouvrirReglagesInstallation();
        return;
      }
      state = state.copyWith(autorisationDemandee: false);
      await _service.installer(fichier);
      state = state.copyWith(installationLancee: true);
    } catch (_) {
      state = state.copyWith(erreur: 'Impossible d’ouvrir l’installateur. Réessayez.');
    }
  }

  /// Retour dans l'application (MaterialApp au premier plan) : reprend
  /// l'installation si l'utilisateur vient d'accorder l'autorisation, ou
  /// signale l'échec si l'on revient de l'installateur sans redémarrage
  /// (installation annulée ou refusée par Android). Sinon, relance la
  /// vérification si la dernière date de plus de [_intervalle].
  Future<void> surRetourPremierPlan() async {
    if (state.installationLancee) {
      state = state.copyWith(
        installationLancee: false,
        erreur: 'La mise à jour n’a pas été installée. Touchez « Installer la mise à jour » pour réessayer.',
      );
      return;
    }
    if (state.autorisationDemandee && state.fichier != null) {
      if (await _service.peutInstaller()) await installer();
      return;
    }
    final derniere = _derniereVerification;
    if (derniere != null && DateTime.now().difference(derniere) > _intervalle) await verifier();
  }
}

final miseAJourProvider = NotifierProvider<MiseAJourController, EtatMiseAJour>(MiseAJourController.new);
