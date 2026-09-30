// src/pages/ParametreAmende.jsx
// Politique de fonds v2 §7 — taux d'amende du médecin, par pays.
// Base retenue (point ouvert C) : crédit net (honoraires − commission) de la
// prochaine libération du médecin. Le montant n'est connu qu'à l'imputation.
import TauxParPays from '../components/TauxParPays';
import { creerParametreAmende, listerParametresAmende } from '../services/fondsService';

const lister = () => listerParametresAmende();

export default function ParametreAmende() {
  return (
    <TauxParPays
      titre="Amendes médecins"
      fil="Amendes médecins"
      intro="Pourcentage prélevé sur la prochaine libération de fonds du médecin après une annulation tardive (moins de 24 h) ou une absence. Le montant est reversé à APS ; plusieurs amendes s’appliquent sur le même crédit, plafonnées à ce crédit."
      alerteAbsent="Sans taux actif, l’enregistrement d’une amende échoue pour les médecins de ces pays."
      libelleModele="Amende médecin"
      lister={lister}
      creer={creerParametreAmende}
    />
  );
}
