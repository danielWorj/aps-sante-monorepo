import 'dart:async';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../controllers/referentiel_controller.dart';
import '../../models/referentiel_models.dart' show Ville, SuggestionVilleGoogle;
import '../../utils/api_client.dart' show ApiException;
import '../style/colors.dart';
import '../style/text_styles.dart';
import 'aps_ui.dart';

// =====================================================================
// Champ « ville » en mode Google Maps — équivalent mobile de ChampVille
// (web). Voir server/src/services/sourceVilles.service.js.
//
// N'est affiché que lorsque `sourceVillesProvider` vaut « google » ; en
// mode manuel, les écrans gardent leur liste déroulante habituelle.
// La feuille propose les villes déjà en base puis les villes Google pas
// encore en base ; une ville Google choisie est importée côté serveur et
// renvoyée comme une [Ville] ordinaire. Si Google tombe en panne, le
// serveur ne renvoie plus que les villes en base : le champ fonctionne
// toujours.
// =====================================================================

class ApsChampVilleGoogle extends ConsumerStatefulWidget {
  const ApsChampVilleGoogle({
    super.key,
    required this.paysId,
    required this.villeId,
    required this.villes,
    required this.onChanged,
    this.decoration,
    this.hint = 'Sélectionner…',
    this.enabled = true,
  });

  final String paysId;
  final String? villeId;

  /// Villes du pays déjà chargées par l'écran (libellé de la ville choisie).
  final List<Ville> villes;
  final ValueChanged<Ville> onChanged;
  final InputDecoration? decoration;
  final String hint;
  final bool enabled;

  @override
  ConsumerState<ApsChampVilleGoogle> createState() => _ApsChampVilleGoogleState();
}

class _ApsChampVilleGoogleState extends ConsumerState<ApsChampVilleGoogle> {
  Ville? _importee;
  bool _ouvert = false;

  String? get _libelle {
    final id = widget.villeId;
    if (id == null) return null;
    for (final v in widget.villes) {
      if (v.villeId == id) return v.nom;
    }
    return _importee?.villeId == id ? _importee!.nom : null;
  }

  Future<void> _ouvrir() async {
    setState(() => _ouvert = true);
    final ville = await showModalBottomSheet<Ville>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: AppColors.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => _FeuilleVilles(paysId: widget.paysId, villeId: widget.villeId),
    );
    if (!mounted) return;
    setState(() => _ouvert = false);
    if (ville == null) return;
    setState(() => _importee = ville);
    if (ville.villeId != widget.villeId) widget.onChanged(ville);
  }

  @override
  Widget build(BuildContext context) {
    final libelle = _libelle;
    final theme = Theme.of(context);
    final deco = (widget.decoration ?? const InputDecoration())
        .applyDefaults(theme.inputDecorationTheme)
        .copyWith(
          enabled: widget.enabled,
          suffixIcon: Padding(
            padding: const EdgeInsets.only(right: 4),
            child: Icon(
              Icons.search_rounded,
              size: 21,
              color: !widget.enabled ? AppColors.ink4 : (_ouvert ? AppColors.b7 : AppColors.ink3),
            ),
          ),
        );

    return Semantics(
      button: true,
      enabled: widget.enabled,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: widget.enabled ? _ouvrir : null,
        child: InputDecorator(
          decoration: deco,
          isFocused: _ouvert,
          child: Text(
            libelle ?? widget.hint,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              fontFamily: AppTextStyles.fontSans,
              fontSize: 14,
              fontWeight: FontWeight.w600,
              color: libelle == null ? AppColors.ink4 : (widget.enabled ? AppColors.ink : AppColors.ink3),
            ),
          ),
        ),
      ),
    );
  }
}

String _nouveauJeton() {
  final r = Random.secure();
  return List.generate(16, (_) => r.nextInt(256).toRadixString(16).padLeft(2, '0')).join();
}

class _FeuilleVilles extends ConsumerStatefulWidget {
  const _FeuilleVilles({required this.paysId, required this.villeId});

  final String paysId;
  final String? villeId;

  @override
  ConsumerState<_FeuilleVilles> createState() => _FeuilleVillesState();
}

class _FeuilleVillesState extends ConsumerState<_FeuilleVilles> {
  final _recherche = TextEditingController();
  final _jeton = _nouveauJeton();
  Timer? _minuteur;
  int _requete = 0;
  bool _chargement = false;
  String? _importEnCours;
  String? _erreur;
  List<Ville> _villes = const [];
  List<SuggestionVilleGoogle> _suggestions = const [];

  @override
  void initState() {
    super.initState();
    _chercher();
  }

  @override
  void dispose() {
    _minuteur?.cancel();
    _recherche.dispose();
    super.dispose();
  }

  void _surSaisie(String _) {
    _minuteur?.cancel();
    _minuteur = Timer(const Duration(milliseconds: 300), _chercher);
  }

  Future<void> _chercher() async {
    final numero = ++_requete;
    setState(() => _chargement = true);
    try {
      final r = await ref.read(referentielRepositoryProvider).rechercherVilles(
            q: _recherche.text.trim(),
            paysId: widget.paysId,
            jetonSession: _jeton,
          );
      if (!mounted || numero != _requete) return;
      setState(() {
        _villes = r.villes;
        _suggestions = r.suggestions;
        _erreur = null;
      });
    } catch (_) {
      if (!mounted || numero != _requete) return;
      setState(() => _erreur = 'Recherche impossible. Vérifiez votre connexion.');
    } finally {
      if (mounted && numero == _requete) setState(() => _chargement = false);
    }
  }

  Future<void> _importer(SuggestionVilleGoogle s) async {
    setState(() {
      _importEnCours = s.placeId;
      _erreur = null;
    });
    try {
      final ville = await ref.read(referentielRepositoryProvider).importerVilleGoogle(
            placeId: s.placeId,
            paysId: widget.paysId,
            jetonSession: _jeton,
          );
      // La liste du pays (écrans en mode manuel, libellés) inclut désormais cette ville.
      ref.invalidate(villesParPaysProvider(widget.paysId));
      if (mounted) Navigator.of(context).pop(ville);
    } on ApiException catch (e) {
      if (mounted) setState(() => _erreur = e.message);
    } catch (_) {
      if (mounted) setState(() => _erreur = "Impossible d'ajouter cette ville pour le moment.");
    } finally {
      if (mounted) setState(() => _importEnCours = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final media = MediaQuery.of(context);
    final q = _recherche.text.trim();
    final vide = !_chargement && _villes.isEmpty && _suggestions.isEmpty;

    return Padding(
      padding: EdgeInsets.only(bottom: media.viewInsets.bottom),
      child: ConstrainedBox(
        constraints: BoxConstraints(maxHeight: media.size.height * 0.8),
        child: Padding(
          padding: EdgeInsets.fromLTRB(16, 0, 16, 12 + media.padding.bottom),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const ApsSheetHeader(title: 'Choisir une ville'),
              const SizedBox(height: 10),
              TextField(
                controller: _recherche,
                onChanged: _surSaisie,
                autofocus: true,
                textInputAction: TextInputAction.search,
                style: const TextStyle(fontSize: 14, color: AppColors.ink),
                decoration: InputDecoration(
                  hintText: 'Rechercher une ville…',
                  isDense: true,
                  filled: true,
                  fillColor: AppColors.bg,
                  contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                  prefixIcon: const Icon(Icons.search_rounded, size: 19, color: AppColors.ink3),
                  prefixIconConstraints: const BoxConstraints(minWidth: 40),
                  suffixIcon: _chargement
                      ? const Padding(
                          padding: EdgeInsets.all(12),
                          child: SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.b7),
                          ),
                        )
                      : null,
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(9),
                    borderSide: const BorderSide(color: AppColors.line),
                  ),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(9),
                    borderSide: const BorderSide(color: AppColors.line),
                  ),
                  focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(9),
                    borderSide: const BorderSide(color: AppColors.b4),
                  ),
                ),
              ),
              if (_erreur != null) ...[
                const SizedBox(height: 8),
                Text(_erreur!, style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: AppColors.danger)),
              ],
              const SizedBox(height: 8),
              Flexible(
                child: vide
                    ? Padding(
                        padding: const EdgeInsets.symmetric(vertical: 24),
                        child: Text(
                          q.length < 2 ? 'Tapez le nom de votre ville' : 'Aucune ville trouvée',
                          textAlign: TextAlign.center,
                          style: const TextStyle(fontSize: 13.5, color: AppColors.ink3),
                        ),
                      )
                    : ListView(
                        shrinkWrap: true,
                        padding: const EdgeInsets.only(bottom: 4),
                        children: [
                          for (final v in _villes)
                            _LigneVille(
                              titre: v.nom,
                              choisie: v.villeId == widget.villeId,
                              onTap: () => Navigator.of(context).pop(v),
                            ),
                          if (_suggestions.isNotEmpty)
                            const Padding(
                              padding: EdgeInsets.fromLTRB(4, 12, 4, 6),
                              child: Text(
                                'AUTRES VILLES · GOOGLE MAPS',
                                style: TextStyle(
                                  fontSize: 11,
                                  fontWeight: FontWeight.w700,
                                  letterSpacing: .4,
                                  color: AppColors.ink3,
                                ),
                              ),
                            ),
                          for (final s in _suggestions)
                            _LigneVille(
                              titre: s.nom,
                              sousTitre: s.description != s.nom ? s.description : null,
                              chargement: _importEnCours == s.placeId,
                              onTap: _importEnCours == null ? () => _importer(s) : null,
                            ),
                        ],
                      ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _LigneVille extends StatelessWidget {
  const _LigneVille({required this.titre, this.sousTitre, this.choisie = false, this.chargement = false, this.onTap});

  final String titre;
  final String? sousTitre;
  final bool choisie;
  final bool chargement;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 2),
      child: Material(
        color: choisie ? AppColors.b1 : Colors.transparent,
        borderRadius: BorderRadius.circular(8),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          splashColor: AppColors.b1,
          highlightColor: AppColors.bg,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        titre,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontFamily: AppTextStyles.fontSans,
                          fontSize: 14.5,
                          fontWeight: choisie ? FontWeight.w700 : FontWeight.w600,
                          color: choisie ? AppColors.b9 : AppColors.ink2,
                        ),
                      ),
                      if (sousTitre != null && sousTitre!.isNotEmpty)
                        Text(
                          sousTitre!,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontSize: 12, color: AppColors.ink3),
                        ),
                    ],
                  ),
                ),
                if (chargement)
                  const SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.b7),
                  )
                else if (choisie)
                  const Icon(Icons.check_rounded, size: 18, color: AppColors.b7),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
