// src/components/MoyensPaiementEnsemble.jsx
// Onglet « Vue d'ensemble » de la page Moyens de paiement : tous les
// médecins ayant déclaré un moyen de paiement, avec leur numéro Mobile
// Money actif (et le nombre d'autres numéros) et l'état de leur compte
// Stripe Connect (réception par carte). Consultation seule ; la gestion
// fine se fait dans l'onglet « Moyens de paiement d'un médecin ».
import { useEffect, useState } from 'react';
import * as moyenPaiementService from '../services/moyenPaiementService';

const FILTRES = [
  { cle: '', libelle: 'Tous' },
  { cle: 'mobile_money', libelle: 'Avec Mobile Money' },
  { cle: 'stripe', libelle: 'Avec carte (Stripe)' },
  { cle: 'sans_actif', libelle: 'Sans numéro actif' },
];

function nomMedecin(m) {
  const u = m.utilisateur || {};
  return [u.prenom, u.nom].filter(Boolean).join(' ') || m.numero_ordre || m.medecin_id;
}

function BadgeStripe({ compte }) {
  if (!compte) return <span className="aps-text-muted">—</span>;
  const resume = compte.derniers_chiffres
    ? `${compte.type_externe === 'card' ? 'Carte' : 'Compte'} ${compte.marque_externe ? compte.marque_externe.toUpperCase() + ' ' : ''}•••• ${compte.derniers_chiffres}`
    : null;
  let badge;
  if (compte.virements_actives) badge = <span className="aps-badge is-success">Actif</span>;
  else if (compte.details_soumis) badge = <span className="aps-badge is-warning">En vérification</span>;
  else badge = <span className="aps-badge is-neutral">Inscription incomplète</span>;
  return (
    <div>
      {badge}
      {resume && <div className="aps-text-muted" style={{ fontSize: 12 }}>{resume}</div>}
      <div className="aps-text-muted" style={{ fontSize: 11 }}>{compte.stripe_account_id}</div>
    </div>
  );
}

export default function MoyensPaiementEnsemble({ onOuvrirMedecin }) {
  const [recherche, setRecherche] = useState('');
  const [filtre, setFiltre] = useState('');
  const [medecins, setMedecins] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [tentative, setTentative] = useState(0);

  // Recherche différée (300 ms) pour ne pas interroger l'API à chaque frappe.
  useEffect(() => {
    let annule = false;
    const minuteur = setTimeout(() => {
      moyenPaiementService
        .listerMoyensPaiementMedecins({ recherche, filtre })
        .then((liste) => { if (!annule) { setMedecins(liste); setErreur(null); } })
        .catch((err) => { if (!annule) setErreur(err.message || 'Chargement impossible.'); });
    }, 300);
    return () => { annule = true; clearTimeout(minuteur); };
  }, [recherche, filtre, tentative]);

  return (
    <div className="aps-tab-pane is-active">
      <div className="aps-toolbar">
        <div className="aps-search">
          <i className="fa-solid fa-magnifying-glass"></i>
          <input
            type="text"
            placeholder="Médecin, n° d'ordre ou numéro de téléphone…"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
          />
        </div>
        <select
          className="form-select form-select-sm"
          style={{ maxWidth: 220 }}
          value={filtre}
          onChange={(e) => setFiltre(e.target.value)}
        >
          {FILTRES.map((f) => (
            <option key={f.cle} value={f.cle}>{f.libelle}</option>
          ))}
        </select>
        <div className="ms-auto aps-text-muted" style={{ fontSize: 13 }}>
          {medecins ? `${medecins.length} médecin${medecins.length > 1 ? 's' : ''}` : ''}
        </div>
      </div>

      {erreur && (
        <div className="aps-notice is-danger mx-3 mb-3">
          <i className="fa-solid fa-triangle-exclamation"></i>
          <div className="flex-grow-1">{erreur}</div>
          <button className="btn btn-sm btn-light" onClick={() => setTentative((t) => t + 1)}>
            <i className="fa-solid fa-rotate-right me-1"></i>Réessayer
          </button>
        </div>
      )}

      <div className="aps-table-wrap">
        <table className="table aps-table">
          <thead>
            <tr>
              <th>Médecin</th>
              <th>Mobile Money actif</th>
              <th>Autres numéros</th>
              <th>Carte bancaire (Stripe)</th>
              <th className="text-end">Actions</th>
            </tr>
          </thead>
          <tbody>
            {medecins === null && !erreur ? (
              <tr>
                <td colSpan={5}>
                  <div className="aps-empty-mini py-3 text-center">
                    <i className="fa-solid fa-spinner fa-spin d-block mb-2"></i>Chargement…
                  </div>
                </td>
              </tr>
            ) : medecins?.length === 0 ? (
              <tr>
                <td colSpan={5}>
                  <div className="aps-empty-mini">Aucun médecin ne correspond.</div>
                </td>
              </tr>
            ) : (
              (medecins || []).map((m) => {
                const actif = m.mobile_moneys.find((mm) => mm.actif);
                const autres = m.mobile_moneys.filter((mm) => !mm.actif);
                return (
                  <tr key={m.medecin_id}>
                    <td>
                      <span className="cell-title">Dr {nomMedecin(m)}</span>
                      <div className="aps-text-muted" style={{ fontSize: 12 }}>
                        {[m.specialite?.nom, m.numero_ordre && `Ordre ${m.numero_ordre}`, m.utilisateur?.telephone]
                          .filter(Boolean)
                          .join(' · ')}
                      </div>
                    </td>
                    <td>
                      {actif ? (
                        <>
                          <span className="aps-badge is-success me-1">Actif</span>
                          <strong>{actif.numero}</strong>
                          <div className="aps-text-muted" style={{ fontSize: 12 }}>
                            {actif.titulaire} · {actif.type_mobile_money?.libelle}
                          </div>
                        </>
                      ) : m.mobile_moneys.length > 0 ? (
                        <span className="aps-badge is-warning">Aucun numéro actif</span>
                      ) : (
                        <span className="aps-text-muted">—</span>
                      )}
                    </td>
                    <td>
                      {autres.length === 0 ? (
                        <span className="aps-text-muted">—</span>
                      ) : (
                        autres.map((mm) => (
                          <div key={mm.id} style={{ fontSize: 13 }}>
                            {mm.numero} <span className="aps-text-muted">({mm.type_mobile_money?.libelle})</span>
                          </div>
                        ))
                      )}
                    </td>
                    <td><BadgeStripe compte={m.compte_stripe} /></td>
                    <td className="text-end">
                      <button className="btn btn-sm btn-outline-primary" onClick={() => onOuvrirMedecin?.(m)}>
                        <i className="fa-solid fa-pen me-1"></i>Gérer
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
