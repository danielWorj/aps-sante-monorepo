// lib/services/facture_pdf_service.dart
//
// Politique de fonds v2 — génération du PDF d'une facture DANS l'app
// (aucun PDF côté serveur : le serveur ne renvoie que du JSON).
//
// Mise en page identique à la card de facture_recapitulative.dart : en-tête
// APS Santé (+ numéro/date), bloc consultation, lignes avec leur formule
// « base × taux », total mis en valeur, note des factures minimales.
//
// Aucun montant n'est calculé ici : on imprime les lignes et le total du
// serveur (somme = montant débité). Les textes viennent de
// utils/facture_format.dart, partagé avec la card.
//
// Dépendances : `pdf` (génération) + `printing` (partage / enregistrement).
// `Printing.sharePdf` ouvre la feuille de partage native (Enregistrer dans
// Fichiers, WhatsApp, e-mail…) : aucune permission de stockage requise.
//
// Polices : Helvetica intégrée à `pdf` (pas de téléchargement de police, donc
// pas de réseau). Les caractères hors Latin-1 sont normalisés par
// [texteSurPdf].

import 'dart:typed_data';
import 'dart:ui' show Rect;

import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';

import '../repositories/paiement_repository.dart';
import '../utils/facture_format.dart';
import '../utils/fonds.dart';

// Palette du design system (miroir de AppColors, sans dépendre de Flutter).
const PdfColor _vert = PdfColor.fromInt(0xFF1E8A63);
const PdfColor _vertClair = PdfColor.fromInt(0xFFF1F8F4);
const PdfColor _encre = PdfColor.fromInt(0xFF16241F);
const PdfColor _encreDouce = PdfColor.fromInt(0xFF5B6B64);
const PdfColor _trait = PdfColor.fromInt(0xFFD3DFD9);

class FacturePdfService {
  const FacturePdfService._();

  /// Nom de fichier proposé à l'enregistrement : `Facture-FAC-….pdf`
  /// (`Apercu-facture-APS-Sante.pdf` avant paiement).
  static String nomFichier(Facture f) {
    if (f.estDevis) return 'Apercu-facture-APS-Sante.pdf';
    final numero = f.numero;
    if (numero == null || numero.isEmpty) return 'Facture-APS-Sante.pdf';
    // Nom de fichier sûr : on ne garde que lettres, chiffres, tiret, point.
    return 'Facture-${numero.replaceAll(RegExp(r'[^A-Za-z0-9._-]'), '_')}.pdf';
  }

  /// Génère le PDF (octets) de [facture].
  static Future<Uint8List> generer(Facture facture) async {
    final doc = pw.Document(
      title: texteSurPdf(
        facture.numero != null
            ? 'Facture ${facture.numero}'
            : 'Facture APS Santé',
      ),
      author: 'APS Santé',
      creator: 'APS Santé',
    );

    doc.addPage(
      pw.Page(
        pageFormat: PdfPageFormat.a4,
        margin: const pw.EdgeInsets.all(40),
        build: (_) => _contenu(facture),
      ),
    );
    return doc.save();
  }

  /// Génère puis ouvre la feuille de partage native (« Enregistrer le PDF »).
  ///
  /// [origine] : zone d'ancrage de la feuille de partage (obligatoire sur
  /// iPad ; ignoré ailleurs). Lève l'exception de `printing` en cas d'échec :
  /// l'appelant affiche un message.
  static Future<void> partager(Facture facture, {Rect? origine}) async {
    final octets = await generer(facture);
    await Printing.sharePdf(
      bytes: octets,
      filename: nomFichier(facture),
      bounds: origine,
    );
  }

  // ─── Mise en page ────────────────────────────────────────────────

  static pw.Widget _contenu(Facture f) {
    final devise = f.devise;
    final date = dateLongueFacture(f.date);
    final e = f.entete;

    final infos = <(String, String)>[
      if (e.specialite != null) ('Spécialité', e.specialite!),
      if (e.pays != null) ('Pays', e.pays!),
      if (e.ville != null) ('Ville', e.ville!),
      if (e.dateCreneau != null)
        ('Rendez-vous', dateHeureUtc(e.dateCreneau)),
    ];

    return pw.Column(
      crossAxisAlignment: pw.CrossAxisAlignment.stretch,
      children: [
        // En-tête
        pw.Container(
          padding: const pw.EdgeInsets.all(16),
          decoration: const pw.BoxDecoration(color: _vert),
          child: pw.Row(
            mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
            crossAxisAlignment: pw.CrossAxisAlignment.center,
            children: [
              pw.Column(
                crossAxisAlignment: pw.CrossAxisAlignment.start,
                children: [
                  pw.Text(
                    texteSurPdf('APS Santé'),
                    style: pw.TextStyle(
                      color: PdfColors.white,
                      fontSize: 20,
                      fontWeight: pw.FontWeight.bold,
                    ),
                  ),
                  pw.SizedBox(height: 2),
                  pw.Text(
                    texteSurPdf(titreFacture(f)),
                    style: const pw.TextStyle(
                      color: PdfColors.white,
                      fontSize: 11,
                    ),
                  ),
                ],
              ),
              pw.Column(
                crossAxisAlignment: pw.CrossAxisAlignment.end,
                children: [
                  if (f.estDevis)
                    pw.Text(
                      'Avant paiement',
                      style: pw.TextStyle(
                        color: PdfColors.white,
                        fontSize: 11,
                        fontWeight: pw.FontWeight.bold,
                      ),
                    )
                  else if (f.numero != null)
                    pw.Text(
                      texteSurPdf(f.numero!),
                      style: pw.TextStyle(
                        color: PdfColors.white,
                        fontSize: 11,
                        fontWeight: pw.FontWeight.bold,
                      ),
                    ),
                  if (date != null)
                    pw.Text(
                      texteSurPdf(date),
                      style: const pw.TextStyle(
                        color: PdfColors.white,
                        fontSize: 10,
                      ),
                    ),
                ],
              ),
            ],
          ),
        ),
        pw.SizedBox(height: 22),

        // Consultation
        pw.Text(
          texteSurPdf('Consultation auprès de ${e.medecin}'),
          style: pw.TextStyle(
            color: _encre,
            fontSize: 14,
            fontWeight: pw.FontWeight.bold,
          ),
        ),
        pw.SizedBox(height: 8),
        for (final (libelle, valeur) in infos)
          pw.Padding(
            padding: const pw.EdgeInsets.only(bottom: 3),
            child: pw.Row(
              crossAxisAlignment: pw.CrossAxisAlignment.start,
              children: [
                pw.SizedBox(
                  width: 90,
                  child: pw.Text(
                    texteSurPdf(libelle),
                    style: const pw.TextStyle(color: _encreDouce, fontSize: 10.5),
                  ),
                ),
                pw.Expanded(
                  child: pw.Text(
                    texteSurPdf(valeur),
                    style: pw.TextStyle(
                      color: _encre,
                      fontSize: 10.5,
                      fontWeight: pw.FontWeight.bold,
                    ),
                  ),
                ),
              ],
            ),
          ),
        pw.SizedBox(height: 18),

        // Lignes
        pw.Container(
          decoration: const pw.BoxDecoration(
            border: pw.Border(top: pw.BorderSide(color: _trait)),
          ),
          child: pw.Column(
            children: [for (final l in f.lignes) _ligne(l, devise)],
          ),
        ),
        pw.SizedBox(height: 14),

        // Total
        pw.Container(
          padding: const pw.EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          decoration: pw.BoxDecoration(
            color: _vertClair,
            border: pw.Border.all(color: _vert, width: 1),
          ),
          child: pw.Row(
            mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
            children: [
              pw.Text(
                'Total',
                style: pw.TextStyle(
                  color: _encre,
                  fontSize: 13,
                  fontWeight: pw.FontWeight.bold,
                ),
              ),
              pw.Text(
                texteSurPdf(montantDevise(f.total, devise)),
                style: pw.TextStyle(
                  color: _vert,
                  fontSize: 16,
                  fontWeight: pw.FontWeight.bold,
                ),
              ),
            ],
          ),
        ),

        if (f.minimale) ...[
          pw.SizedBox(height: 12),
          pw.Text(
            texteSurPdf(
              'Ce paiement a été effectué avant la mise en place du détail '
              'des frais : seul le montant total débité est affiché.',
            ),
            style: const pw.TextStyle(color: _encreDouce, fontSize: 9.5),
          ),
        ],

        pw.Spacer(),
        pw.Text(
          texteSurPdf(
            f.estDevis
                ? 'Aperçu non contractuel : la facture définitive est émise '
                    'après confirmation du paiement.'
                : 'Document généré par l\'application APS Santé.',
          ),
          textAlign: pw.TextAlign.center,
          style: const pw.TextStyle(color: _encreDouce, fontSize: 8.5),
        ),
      ],
    );
  }

  static pw.Widget _ligne(LigneFacture l, String devise) {
    final detail = formuleLigne(l, devise);
    return pw.Container(
      padding: const pw.EdgeInsets.symmetric(vertical: 9),
      decoration: const pw.BoxDecoration(
        border: pw.Border(bottom: pw.BorderSide(color: _trait)),
      ),
      child: pw.Row(
        crossAxisAlignment: pw.CrossAxisAlignment.start,
        mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
        children: [
          pw.Expanded(
            child: pw.Column(
              crossAxisAlignment: pw.CrossAxisAlignment.start,
              children: [
                pw.Text(
                  texteSurPdf(l.libelle),
                  style: const pw.TextStyle(color: _encre, fontSize: 11.5),
                ),
                if (detail.isNotEmpty)
                  pw.Padding(
                    padding: const pw.EdgeInsets.only(top: 2),
                    child: pw.Text(
                      texteSurPdf(detail),
                      style: const pw.TextStyle(
                        color: _encreDouce,
                        fontSize: 9.5,
                      ),
                    ),
                  ),
              ],
            ),
          ),
          pw.SizedBox(width: 12),
          pw.Text(
            texteSurPdf(montantDevise(l.montant, devise)),
            style: pw.TextStyle(
              color: _encre,
              fontSize: 11.5,
              fontWeight: pw.FontWeight.bold,
            ),
          ),
        ],
      ),
    );
  }
}