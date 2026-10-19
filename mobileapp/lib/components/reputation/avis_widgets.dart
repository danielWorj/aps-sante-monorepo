// lib/components/reputation/avis_widgets.dart
//
// Avis patients : synthèse des notes ([ResumeNotesVue]) et carte d'un avis
// ([CarteAvisVue]) — partagés par l'espace médecin et la fiche publique.

import 'package:flutter/material.dart';

import '../../models/reputation_medecin_models.dart';
import '../style/colors.dart';
import '../style/text_styles.dart';
import 'reputation_ui.dart';

/// Synthèse : grande note, étoiles, nombre d'avis, recommandation,
/// répartition 5 → 1 (touchable pour filtrer si [onFiltrerNote]) et
/// moyenne par critère.
class ResumeNotesVue extends StatelessWidget {
  const ResumeNotesVue({super.key, required this.resume, this.filtreNote, this.onFiltrerNote});

  final ResumeNotes resume;
  final int? filtreNote;
  final ValueChanged<int?>? onFiltrerNote;

  @override
  Widget build(BuildContext context) {
    if (resume.nombre == 0) {
      return Row(
        children: [
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(color: AppColors.amber100, borderRadius: BorderRadius.circular(8)),
            child: const Icon(Icons.star_outline_rounded, color: AppColors.amber500),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text("Pas encore d'avis", style: AppTextStyles.strong),
                const SizedBox(height: 2),
                Text('Les avis sont déposés par des patients après une consultation réalisée via APS Santé.',
                    style: AppTextStyles.small.copyWith(fontSize: 12)),
              ],
            ),
          ),
        ],
      );
    }

    final criteres = criteresAvis.where((c) => resume.criteres[c.cle] != null).toList();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            SizedBox(
              width: 112,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text.rich(
                    TextSpan(children: [
                      TextSpan(text: decimalFr(resume.moyenne)),
                      TextSpan(
                        text: ' /5',
                        style: AppTextStyles.small.copyWith(fontWeight: FontWeight.w700, color: AppColors.ink3),
                      ),
                    ]),
                    style: const TextStyle(
                      fontFamily: AppTextStyles.fontSans,
                      fontSize: 38,
                      height: 1,
                      fontWeight: FontWeight.w800,
                      letterSpacing: -1.2,
                      color: AppColors.ink,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Etoiles(resume.moyenne, taille: 15),
                  const SizedBox(height: 6),
                  Text('${nombreFr(resume.nombre)} avis vérifiés', style: AppTextStyles.xs),
                ],
              ),
            ),
            const SizedBox(width: 14),
            Container(width: 1, height: 96, color: AppColors.line),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                children: [
                  for (var n = 5; n >= 1; n--) _LigneDistribution(
                    note: n,
                    nombre: resume.distribution[n] ?? 0,
                    max: resume.maxDistribution,
                    actif: filtreNote == n,
                    onTap: onFiltrerNote == null || ((resume.distribution[n] ?? 0) == 0 && filtreNote != n)
                        ? null
                        : () => onFiltrerNote!(filtreNote == n ? null : n),
                  ),
                ],
              ),
            ),
          ],
        ),
        if (resume.tauxRecommandation != null || criteres.isNotEmpty) ...[
          const SizedBox(height: 16),
          const Divider(height: 1),
          const SizedBox(height: 14),
        ],
        if (resume.tauxRecommandation != null)
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Row(
              children: [
                const Icon(Icons.thumb_up_alt_outlined, size: 16, color: AppColors.b7),
                const SizedBox(width: 8),
                Text.rich(
                  TextSpan(children: [
                    TextSpan(text: '${resume.tauxRecommandation} %', style: const TextStyle(fontWeight: FontWeight.w800, color: AppColors.ink)),
                    const TextSpan(text: ' des patients recommandent ce médecin'),
                  ]),
                  style: AppTextStyles.small.copyWith(fontSize: 12.5),
                ),
              ],
            ),
          ),
        for (final c in criteres)
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    Expanded(child: Text(c.libelle, style: AppTextStyles.small.copyWith(fontSize: 12.5))),
                    Text(decimalFr(resume.criteres[c.cle]), style: AppTextStyles.strong.copyWith(fontSize: 12.5)),
                  ],
                ),
                const SizedBox(height: 5),
                Piste(part: (resume.criteres[c.cle] ?? 0) / 5, hauteur: 5),
              ],
            ),
          ),
      ],
    );
  }
}

class _LigneDistribution extends StatelessWidget {
  const _LigneDistribution({required this.note, required this.nombre, required this.max, required this.actif, this.onTap});
  final int note;
  final int nombre;
  final int max;
  final bool actif;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: onTap != null,
      selected: actif,
      label: '$note étoile${note > 1 ? 's' : ''} : $nombre avis',
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(6),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3.5),
          decoration: BoxDecoration(
            color: actif ? AppColors.b0 : Colors.transparent,
            borderRadius: BorderRadius.circular(6),
          ),
          child: Row(
            children: [
              SizedBox(
                width: 22,
                child: Text('$note', style: AppTextStyles.xs.copyWith(fontWeight: FontWeight.w800, color: AppColors.ink2)),
              ),
              Expanded(child: Piste(part: nombre / max)),
              SizedBox(
                width: 30,
                child: Text(nombreFr(nombre), textAlign: TextAlign.right, style: AppTextStyles.xs),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Un avis : auteur, note, commentaire, critères, réponse du médecin.
/// [pied] : actions (espace médecin) ; [remplacementReponse] : éditeur.
class CarteAvisVue extends StatelessWidget {
  const CarteAvisVue({
    super.key,
    required this.avis,
    this.nomMedecin = 'Le médecin',
    this.pied,
    this.remplacementReponse,
    this.libelleReponse,
  });

  final AvisPublic avis;
  final String nomMedecin;

  /// Titre de la réponse (défaut « Réponse de [nomMedecin] » ; l'espace
  /// médecin affiche « Votre réponse »).
  final String? libelleReponse;
  final Widget? pied;
  final Widget? remplacementReponse;

  String get _initiales {
    if (avis.auteur == 'Patient vérifié') return '';
    final parts = avis.auteur.replaceAll('.', '').split(RegExp(r'\s+')).where((p) => p.isNotEmpty);
    return parts.take(2).map((p) => p[0].toUpperCase()).join();
  }

  @override
  Widget build(BuildContext context) {
    final criteres = criteresAvis.where((c) => avis.criteres[c.cle] != null).toList();
    return CarteReputation(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 38,
                height: 38,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: _initiales.isEmpty ? AppColors.bg : AppColors.b0,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: _initiales.isEmpty ? AppColors.line : AppColors.b1),
                ),
                child: _initiales.isEmpty
                    ? const Icon(Icons.shield_outlined, size: 17, color: AppColors.ink3)
                    : Text(_initiales, style: AppTextStyles.small.copyWith(fontWeight: FontWeight.w800, color: AppColors.b8)),
              ),
              const SizedBox(width: 11),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Wrap(
                      crossAxisAlignment: WrapCrossAlignment.center,
                      spacing: 6,
                      runSpacing: 2,
                      children: [
                        Text(avis.auteur, style: AppTextStyles.strong.copyWith(fontSize: 13.5)),
                        // Un auteur anonyme s'affiche déjà « Patient vérifié ».
                        if (avis.patientVerifie && avis.auteur != 'Patient vérifié')
                          const Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(Icons.verified_rounded, size: 13, color: AppColors.b7),
                              SizedBox(width: 3),
                              Text('Patient vérifié',
                                  style: TextStyle(fontFamily: AppTextStyles.fontSans, fontSize: 10.5, fontWeight: FontWeight.w700, color: AppColors.b8)),
                            ],
                          ),
                      ],
                    ),
                    const SizedBox(height: 2),
                    Text(
                      [
                        ilYA(avis.dateCreation),
                        if (avis.typeConsultation != null)
                          avis.typeConsultation == 'teleconsultation' ? 'Téléconsultation' : 'Au cabinet',
                      ].join(' · '),
                      style: AppTextStyles.xs,
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Etoiles(avis.note.toDouble(), taille: 13),
                  const SizedBox(height: 3),
                  Text('${avis.note}/5', style: AppTextStyles.xs.copyWith(fontWeight: FontWeight.w800, color: AppColors.ink)),
                ],
              ),
            ],
          ),
          const SizedBox(height: 12),
          if (avis.commentaire != null && avis.commentaire!.isNotEmpty)
            Text(avis.commentaire!, style: AppTextStyles.body.copyWith(fontSize: 13.5, height: 1.5, color: AppColors.ink))
          else
            Text('Note sans commentaire.', style: AppTextStyles.small.copyWith(fontStyle: FontStyle.italic, color: AppColors.ink3)),
          if (criteres.isNotEmpty || avis.recommande != null) ...[
            const SizedBox(height: 10),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                for (final c in criteres) PuceDiscrete('${c.libelle} ${avis.criteres[c.cle]}/5'),
                if (avis.recommande == true)
                  const PuceDiscrete('Recommande', icone: Icons.thumb_up_alt_outlined, fond: AppColors.b0, couleur: AppColors.b8),
                if (avis.recommande == false)
                  const PuceDiscrete('Ne recommande pas', icone: Icons.thumb_down_alt_outlined, fond: AppColors.coral100, couleur: AppColors.coral600),
              ],
            ),
          ],
          if (avis.signaleLe != null) ...[
            const SizedBox(height: 10),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
              decoration: BoxDecoration(color: AppColors.amber100, borderRadius: BorderRadius.circular(6)),
              child: Row(
                children: [
                  const Icon(Icons.flag_outlined, size: 14, color: AppColors.amber700),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text('Signalé — en cours d\'examen par APS Santé',
                        style: AppTextStyles.xs.copyWith(color: AppColors.amber700, fontWeight: FontWeight.w700)),
                  ),
                ],
              ),
            ),
          ],
          if (remplacementReponse != null)
            remplacementReponse!
          else if (avis.reponse != null) ...[
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.fromLTRB(12, 10, 12, 11),
              decoration: const BoxDecoration(
                color: AppColors.bg,
                border: Border(left: BorderSide(color: AppColors.b7, width: 2.5)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text.rich(
                    TextSpan(children: [
                      TextSpan(text: libelleReponse ?? 'Réponse de $nomMedecin', style: const TextStyle(fontWeight: FontWeight.w800, color: AppColors.b8)),
                      TextSpan(text: ' · ${ilYA(avis.dateReponse)}'),
                    ]),
                    style: AppTextStyles.xs,
                  ),
                  const SizedBox(height: 4),
                  Text(avis.reponse!, style: AppTextStyles.small.copyWith(fontSize: 12.5, color: AppColors.ink, height: 1.45)),
                ],
              ),
            ),
          ],
          if (pied != null) ...[
            const SizedBox(height: 12),
            const Divider(height: 1),
            const SizedBox(height: 8),
            pied!,
          ],
        ],
      ),
    );
  }
}
