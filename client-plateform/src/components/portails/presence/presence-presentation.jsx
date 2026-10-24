// presence-presentation.jsx — portails pharmacie et centre de santé, « Présentation ».
//
// Contenus enrichis de la fiche : description et services particuliers
// (pharmacie), présentation / spécialités et équipe (centre de santé).
// Toujours conservés ; visibles du public seulement avec un abonnement qui
// les inclut, après contrôle qualité par ApSa (la fiche repasse en
// vérification à l'enregistrement). Contenu factuel, jamais promotionnel.
import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useToast } from '../../feedback';
import { PresencePortailPage } from '../layouts/presence.portail-sidebar';
import { modifierPharmacie } from '../../../services/pharmacieService';
import { modifierCentreSante } from '../../../services/structureSanteService';
import { BandeauMasque } from './presenceCommun';

const CHAMPS = {
  pharmacie: [
    // [champ, libellé, aide, droit qui l'expose au public]
    ['description_enrichie', "Description de l'officine", 'Présentation factuelle : accès, stationnement, langues parlées, spécialités de l’officine…', 'description_enrichie'],
    ['services_particuliers', 'Services particuliers', 'Ex. : préparations magistrales, tests rapides, prise de tension, livraison, matériel médical, orthopédie…', 'description_enrichie'],
  ],
  structure: [
    ['description_enrichie', 'Présentation et spécialités', 'Spécialités, services, plateau technique (imagerie, bloc, maternité…), accès…', 'description_enrichie'],
    ['presentation_equipe', "Présentation de l'équipe", 'Médecins, spécialistes, responsables de service… (informations factuelles)', 'presentation_equipe'],
  ],
};

export default function PresencePresentation() {
  const { type, fiche, droits, rechargerFiche } = useOutletContext();
  const champs = CHAMPS[type];
  const toast = useToast();
  const [valeurs, setValeurs] = useState(() => Object.fromEntries(champs.map(([cle]) => [cle, fiche[cle] ?? ''])));
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState(null);
  const auMoinsUnMasque = champs.some(([, , , droit]) => !droits[droit]);

  const enregistrer = async (e) => {
    e.preventDefault();
    setEnvoi(true);
    setErreur(null);
    try {
      if (type === 'pharmacie') await modifierPharmacie(fiche.acteur_id, valeurs);
      else await modifierCentreSante(fiche.acteur_id, valeurs);
      toast.succes('Présentation enregistrée. Votre fiche repasse en vérification par ApSa.', { duree: 6000 });
      rechargerFiche();
    } catch (err) {
      setErreur(err?.message || 'Enregistrement impossible.');
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <PresencePortailPage titre="Présentation" description="Ce qui distingue votre établissement, en quelques lignes factuelles.">
      <form className="d-flex flex-column gap-4" onSubmit={enregistrer}>
        <BandeauMasque type={type} visible={!auMoinsUnMasque}>
          Certains de ces contenus sont enregistrés mais masqués au public : votre abonnement actuel ne les inclut pas.
        </BandeauMasque>
        <div className="info-card">
          <h3><i className="fa-solid fa-align-left" /> Contenus enrichis</h3>
          <p className="minimal-note">
            Restez factuel : aucun message promotionnel (prix barrés, « meilleur de la ville »…). ApSa vérifie chaque modification
            avant publication ; votre fiche reste en ligne pendant la vérification.
          </p>
          {champs.map(([cle, libelle, aide, droit]) => (
            <div className="mb-3" key={cle}>
              <label className="form-label-aps" htmlFor={`pres-${cle}`}>
                {libelle}{' '}
                <span className={`badge ${droits[droit] ? 'bg-success' : 'bg-secondary'}`}>
                  {droits[droit] ? 'Visible du public' : 'Masqué au public'}
                </span>
              </label>
              <textarea
                id={`pres-${cle}`}
                className="form-control"
                rows={6}
                maxLength={5000}
                placeholder={aide}
                value={valeurs[cle]}
                onChange={(e) => setValeurs((v) => ({ ...v, [cle]: e.target.value }))}
              />
              <div className="text-end text-faint small">{valeurs[cle].length} / 5000</div>
            </div>
          ))}
          {erreur && <div className="alert alert-danger">{erreur}</div>}
          <div className="text-end">
            <button type="submit" className="btn btn-primary btn-sm-aps" disabled={envoi}>
              {envoi ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </div>
      </form>
    </PresencePortailPage>
  );
}
