// src/pages/LignesTarifaires.jsx
// Commissions APS par pays — deux onglets, deux types de ligne tarifaire :
//   • Commission médecin (CM, type_frais « commission ») : part des honoraires
//     retenue sur le médecin À LA LIBÉRATION des fonds ;
//   • Commission patient (CP, type_frais « commission_patient ») : ajoutée au
//     total payé par le patient au moment du paiement (total = H + frais
//     d'agrégateur + H × taux CP).
// Chaque onglet réutilise TauxParPays (taux versionné par pays : « Définir »
// crée une nouvelle version active, l'ancienne reste dans l'historique).
import { useState } from 'react';
import TauxParPays from '../components/TauxParPays';
import {
  creerCommissionMedecin,
  creerCommissionPatient,
  listerCommissionsMedecin,
  listerCommissionsPatient,
} from '../services/fondsService';

const ONGLETS = {
  medecin: {
    label: 'Commission médecin (CM)',
    titre: 'Commission médecin (CM)',
    fil: 'Commission médecin (CM)',
    intro:
      'Part des honoraires retenue par APS lors de la libération des fonds vers le médecin : le médecin reçoit honoraires − CM (avant amendes). Elle n’est jamais ajoutée au prix payé par le patient (voir « Commission patient »).',
    alerteAbsent: 'Sans commission médecin active, la libération des fonds est impossible pour les médecins de ces pays.',
    graviteAbsent: 'warning',
    libelleModele: 'Commission médecin',
    lister: listerCommissionsMedecin, // références stables (hors composant)
    creer: creerCommissionMedecin,
  },
  patient: {
    label: 'Commission patient (CP)',
    titre: 'Commission patient (CP)',
    fil: 'Commission patient (CP)',
    intro:
      'Commission APS ajoutée au total payé par le patient : total = honoraires + frais d’agrégateur + (honoraires × taux CP). Elle apparaît sur la facture sous « Commission APS ». Elle n’est remboursée au patient que si le médecin est fautif (ou en cas de double paiement) ; sinon APS la conserve.',
    alerteAbsent:
      'Sans commission patient active, AUCUN paiement n’est possible pour les médecins de ces pays (paiement refusé). Créez la ligne de chaque pays AVANT le déploiement.',
    graviteAbsent: 'danger',
    libelleModele: 'Commission patient',
    lister: listerCommissionsPatient,
    creer: creerCommissionPatient,
  },
};

export default function LignesTarifaires() {
  const [onglet, setOnglet] = useState('medecin');
  const cfg = ONGLETS[onglet];

  const barreOnglets = (
    <ul className="nav nav-tabs mb-3" role="tablist">
      {Object.entries(ONGLETS).map(([cle, o]) => (
        <li className="nav-item" role="presentation" key={cle}>
          <button
            type="button"
            role="tab"
            aria-selected={onglet === cle}
            className={`nav-link${onglet === cle ? ' active' : ''}`}
            onClick={() => setOnglet(cle)}
          >
            {o.label}
          </button>
        </li>
      ))}
    </ul>
  );

  return (
    <TauxParPays
      key={onglet} // remonte l'écran : états (formulaire, historique, messages) propres à chaque onglet
      titre={cfg.titre}
      fil={cfg.fil}
      intro={cfg.intro}
      alerteAbsent={cfg.alerteAbsent}
      graviteAbsent={cfg.graviteAbsent}
      libelleModele={cfg.libelleModele}
      lister={cfg.lister}
      creer={cfg.creer}
      onglets={barreOnglets}
      note={
        onglet === 'patient' ? (
          <p className="aps-text-muted small">
            Un taux de <strong>0 %</strong> est valide (aucune commission côté patient). Seule l’<strong>absence</strong> de
            ligne active pour un pays bloque les paiements.
          </p>
        ) : null
      }
    />
  );
}