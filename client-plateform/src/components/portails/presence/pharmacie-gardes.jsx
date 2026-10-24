// pharmacie-gardes.jsx — portail pharmacie, « Gardes ».
//
// Gardes officielles de la pharmacie (plannings publiés par ApSa d'après
// l'autorité de chaque pays) : garde en cours, à venir, passées. Lecture
// seule : une pharmacie ne fixe pas elle-même ses gardes ; une erreur se
// signale à ApSa. Les gardes sont toujours publiques (« pharmacie de garde »).
import { useCallback, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { PresencePortailPage } from '../layouts/presence.portail-sidebar';
import { listerGardesGestion } from '../../../services/espacePresenceService';
import { EtatChargement } from './presenceCommun';
import { useRessource } from './presenceOutils';

const moment = (iso) =>
  new Date(iso).toLocaleString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export default function PharmacieGardes() {
  const { acteurId } = useOutletContext();
  const [periode, setPeriode] = useState('a_venir');
  const charger = useCallback(() => listerGardesGestion(acteurId, periode), [acteurId, periode]);
  const etat = useRessource(charger);
  const gardes = etat.donnees?.gardes ?? [];

  const selecteur = (
    <div className="aps-tabs aps-tabs-compact" role="group" aria-label="Période">
      {[['a_venir', 'En cours et à venir'], ['passees', 'Passées']].map(([cle, label]) => (
        <button key={cle} type="button" className={periode === cle ? 'active' : ''} aria-pressed={periode === cle} onClick={() => setPeriode(cle)}>{label}</button>
      ))}
    </div>
  );

  return (
    <PresencePortailPage
      titre="Gardes"
      description="Vos gardes officielles, telles qu'elles sont affichées aux patients qui cherchent une pharmacie de garde."
      actions={selecteur}
    >
      <EtatChargement {...etat}>
        <div className="info-card">
          {gardes.length === 0 ? (
            <div className="aps-empty-state">
              <i className="fa-solid fa-moon"></i>
              <div>{periode === 'a_venir' ? 'Aucune garde en cours ou à venir dans les plannings publiés.' : 'Aucune garde passée.'}</div>
            </div>
          ) : (
            <table className="hours-table" style={{ width: '100%' }}>
              <thead><tr><th>Début</th><th>Fin</th><th>Ville</th><th></th></tr></thead>
              <tbody>
                {gardes.map((g) => (
                  <tr key={g.garde_id}>
                    <td>{moment(g.date_debut)}</td>
                    <td>{moment(g.date_fin)}</td>
                    <td>{g.ville?.nom ?? '—'}</td>
                    <td>{g.en_cours && <span className="chip chip-verifie">En cours</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="minimal-note mt-3 mb-0">
            <i className="fa-solid fa-circle-info" /> Les gardes sont planifiées par ApSa d&apos;après le calendrier officiel de votre pays.
            Une garde manquante ou erronée ? <Link to="/contact">Signalez-le à ApSa</Link>.
          </p>
        </div>
      </EtatChargement>
    </PresencePortailPage>
  );
}
