// src/pages/LignesTarifaires.jsx
// Commission APS par pays (seul type de ligne tarifaire restant en v2).
// Prélevée sur le médecin À LA LIBÉRATION : jamais à la charge du patient.
import TauxParPays from '../components/TauxParPays';
import { creerLigneTarifaire, listerLignesTarifaires } from '../services/fondsService';

const lister = () => listerLignesTarifaires({ type_frais: 'commission' }); // référence stable
const creer = (b) => creerLigneTarifaire({ ...b, type_frais: 'commission' });

export default function LignesTarifaires() {
  return (
    <TauxParPays
      titre="Commission APS"
      fil="Commission APS"
      intro="Part des honoraires retenue par APS lors de la libération des fonds vers le médecin (le médecin reçoit honoraires − commission). Elle n’est jamais ajoutée au prix payé par le patient."
      alerteAbsent="Sans commission active, aucun paiement n’est possible pour les médecins de ces pays."
      libelleModele="Commission APS"
      lister={lister}
      creer={creer}
    />
  );
}
