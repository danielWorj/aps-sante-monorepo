// Mentions « Conditions générales d'utilisation » et « Politique de
// confidentialité » cliquables. Les documents sont rédigés au back-office
// et affichés par le site web : l'application ouvre ces pages dans le
// navigateur du téléphone (pas de rendu dans l'application).
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../utils/endpoint.dart';
import '../style/colors.dart';

/// Ouvre /cgu ou /confidentialite du site web dans le navigateur.
Future<void> ouvrirPageLegale(BuildContext context, String chemin) async {
  final messager = ScaffoldMessenger.maybeOf(context);
  final uri = Uri.parse('${ApiRealEndpoints.siteWebUrl}$chemin');
  var ouvert = false;
  try {
    ouvert = await launchUrl(uri, mode: LaunchMode.externalApplication);
  } catch (_) {}
  if (!ouvert) {
    messager?.showSnackBar(
      SnackBar(content: Text('Impossible d’ouvrir ${uri.toString()}')),
    );
  }
}

/// « J'accepte les Conditions générales d'utilisation et la Politique de
/// confidentialité. » avec les deux intitulés cliquables. Un appui
/// ailleurs sur le texte reste transmis à la case à cocher parente.
class TexteAcceptationLegale extends StatefulWidget {
  const TexteAcceptationLegale({
    super.key,
    this.debut = "J'accepte les ",
    this.style,
    this.textAlign,
  });

  final String debut;
  final TextStyle? style;
  final TextAlign? textAlign;

  @override
  State<TexteAcceptationLegale> createState() => _TexteAcceptationLegaleState();
}

class _TexteAcceptationLegaleState extends State<TexteAcceptationLegale> {
  late final TapGestureRecognizer _cgu;
  late final TapGestureRecognizer _confidentialite;

  @override
  void initState() {
    super.initState();
    _cgu = TapGestureRecognizer()..onTap = () => ouvrirPageLegale(context, '/cgu');
    _confidentialite = TapGestureRecognizer()
      ..onTap = () => ouvrirPageLegale(context, '/confidentialite');
  }

  @override
  void dispose() {
    _cgu.dispose();
    _confidentialite.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    const lien = TextStyle(
      color: AppColors.b6,
      fontWeight: FontWeight.w700,
      decoration: TextDecoration.underline,
    );
    return Text.rich(
      TextSpan(
        style: widget.style,
        children: [
          TextSpan(text: widget.debut),
          TextSpan(text: "Conditions générales d'utilisation", style: lien, recognizer: _cgu),
          const TextSpan(text: ' et la '),
          TextSpan(text: 'Politique de confidentialité', style: lien, recognizer: _confidentialite),
          const TextSpan(text: '.'),
        ],
      ),
      textAlign: widget.textAlign,
    );
  }
}
