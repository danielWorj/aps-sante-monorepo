// src/pages/AbonnementsPresence.jsx
//
// Suivi des abonnements de présence d'un type d'acteur (pharmacies,
// centres de santé, médecins) — même écran que AbonnementsAssurance.jsx :
//   - indicateurs : abonnés actifs, échéances à 30 jours, revenus PAR DEVISE
//     (jamais additionnés), taux de renouvellement ;
//   - liste filtrable (statut, pays, échéance proche) ;
//   - nouvel abonnement : geste commercial (gratuit, motif obligatoire) ou
//     virement (activé par « Encaissement constaté ») ;
//   - suspendre (incident éthique, plainte), rétablir, prolonger.
// Toutes ces actions sont journalisées côté serveur (journal d'audit).
// date_fin est EXCLUSIVE : on affiche le dernier jour couvert.
import { useCallback, useEffect, useState } from 'react';
import { useToast } from '../components/feedback';
import { Link } from 'react-router-dom';
import './../assets/style/Referentiel.css';
import FondsModal from '../components/FondsModal';
import { listerPays } from '../services/referentielService';
import {
  TYPES_PRESENCE,
  listerAbonnements,
  obtenirTableauDeBord,
  creerAbonnementAdmin,
  constaterEncaissement,
  suspendreAbonnement,
  retablirAbonnement,
  prolongerAbonnement,
  listerNiveaux,
  listerRemises,
  listerFiches,
  STATUTS_ABONNEMENT,
  ORIGINES_ABONNEMENT,
  dernierJourCouvert,
  dateCourte,
} from '../services/abonnementPresenceService';
import { montantDevise } from '../utils/fonds';

function Kpi({ icone, variante, libelle, valeur, detail }) {
  return (
    <div className="col-md-3">
      <div className="aps-kpi">
        <div className="aps-kpi__top">
          <div className={`aps-kpi__icon ${variante}`}><i className={`fa-solid ${icone}`}></i></div>
        </div>
        <div className="aps-kpi__label">{libelle}</div>
        <div className="aps-kpi__value">{valeur}</div>
        {detail && <div className="small aps-text-muted">{detail}</div>}
      </div>
    </div>
  );
}

const NOUVEL_VIDE = { acteur_id: '', niveau_id: '', duree_mois: '', origine: 'geste', motif: '' };

const TITRES = {
  nouveau: 'Nouvel abonnement',
  encaissement: 'Encaissement constaté (virement)',
  suspendre: "Suspendre l'abonnement",
  retablir: "Rétablir l'abonnement",
  prolonger: "Prolonger l'abonnement",
};

export default function AbonnementsPresence({ type }) {
  const config = TYPES_PRESENCE[type];
  const [filtres, setFiltres] = useState({ statut: '', pays_id: '', echeance_jours: '' });
  const [abonnements, setAbonnements] = useState([]);
  const [tableau, setTableau] = useState(null);
  const [pays, setPays] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState(null);
  const toast = useToast();

  const [action, setAction] = useState(null);
  const [form, setForm] = useState({});
  const [refs, setRefs] = useState({ fiches: [], niveaux: [], remises: [] });
  const [erreurForm, setErreurForm] = useState(null);
  const [envoi, setEnvoi] = useState(false);

  const charger = useCallback(
    () =>
      Promise.all([listerAbonnements(type, filtres), obtenirTableauDeBord(type)])
        .then(([liste, tb]) => { setAbonnements(liste); setTableau(tb); setErreur(null); })
        .catch((err) => setErreur(err.message || 'Chargement impossible.'))
        .finally(() => setChargement(false)),
    [type, filtres]
  );
  useEffect(() => { charger(); }, [charger]);

  useEffect(() => {
    listerPays().then((p) => setPays(p ?? [])).catch(() => {});
  }, []);

  const ouvrir = async (typeAction, abonnement = null) => {
    setErreurForm(null);
    setAction({ type: typeAction, abonnement });
    if (typeAction === 'nouveau') {
      setForm({ ...NOUVEL_VIDE });
      try {
        const [fiches, niveaux, remises] = await Promise.all([
          listerFiches(type, { statut_verification: 'publie' }),
          listerNiveaux(type),
          listerRemises(type),
        ]);
        // Médecins : seuls ceux dont le pays rend l'abonnement obligatoire.
        setRefs({ fiches: fiches.filter((f) => f.abonnement_requis), niveaux: niveaux.filter((n) => n.actif), remises });
      } catch (err) {
        setErreurForm(err.message || 'Chargement des listes impossible.');
      }
    } else if (typeAction === 'prolonger') {
      setForm({ mois: '', jours: '', motif: '' });
    } else {
      setForm({ motif: '', reference_virement: '' });
    }
  };

  const fermer = () => { if (!envoi) setAction(null); };
  const maj = (champ, valeur) => setForm((f) => ({ ...f, [champ]: valeur }));

  const valider = async (e) => {
    e.preventDefault();
    setErreurForm(null);
    setEnvoi(true);
    const a = action.abonnement;
    try {
      if (action.type === 'nouveau') {
        const cree = await creerAbonnementAdmin(type, {
          acteur_id: form.acteur_id,
          niveau_id: form.niveau_id,
          duree_mois: Number(form.duree_mois),
          origine: form.origine,
          motif: form.motif.trim() || undefined,
        });
        toast.succes(cree.statut === 'actif'
          ? 'Abonnement activé (geste commercial).'
          : `Abonnement en attente de virement : ${montantDevise(cree.montant_total, cree.devise)} (référence ${cree.abonnement_id}).`, { duree: 0 });
      } else if (action.type === 'encaissement') {
        const r = await constaterEncaissement(type, a.abonnement_id, { reference_virement: form.reference_virement.trim() || undefined });
        toast.succes(`Encaissement constaté : abonnement activé${r.facture?.numero ? `, facture ${r.facture.numero}` : ''}.`);
      } else if (action.type === 'suspendre') {
        await suspendreAbonnement(type, a.abonnement_id, form.motif.trim() || undefined);
        toast.succes('Abonnement suspendu : la fiche repasse au palier Basique.');
      } else if (action.type === 'retablir') {
        await retablirAbonnement(type, a.abonnement_id, form.motif.trim() || undefined);
        toast.succes('Abonnement rétabli (dates inchangées).');
      } else if (action.type === 'prolonger') {
        await prolongerAbonnement(type, a.abonnement_id, {
          mois: form.mois === '' ? undefined : Number(form.mois),
          jours: form.jours === '' ? undefined : Number(form.jours),
          motif: form.motif.trim(),
        });
        toast.succes('Abonnement prolongé.');
      }
      setAction(null);
      await charger();
    } catch (err) {
      setErreurForm(err.message || 'Action impossible.');
    } finally {
      setEnvoi(false);
    }
  };

  const remiseDe = (duree) => refs.remises.find((r) => r.duree_mois === Number(duree));

  return (
    <main className="aps-content">
      <div className="aps-page-header">
        <div>
          <div className="aps-breadcrumb">Back-office <span className="sep">/</span> {config.libelle} <span className="sep">/</span> Abonnements</div>
          <h1>Abonnements de présence — {config.libelle}</h1>
        </div>
        <div className="d-flex gap-2">
          <button className="btn btn-light" onClick={() => { setChargement(true); charger(); }} disabled={chargement}><i className="fa-solid fa-rotate me-2"></i>Actualiser</button>
          <button className="btn btn-primary" onClick={() => ouvrir('nouveau')}><i className="fa-solid fa-plus me-2"></i>Nouvel abonnement</button>
        </div>
      </div>

      {type === 'medecin' && tableau && (
        <div className="alert alert-info">
          {tableau.pays_obligatoires?.length
            ? <>Abonnement obligatoire pour les médecins de : <strong>{tableau.pays_obligatoires.join(', ')}</strong>. Ailleurs, les médecins gardent toutes leurs fonctionnalités sans abonnement.</>
            : <>L&apos;abonnement des médecins n&apos;est obligatoire dans aucun pays : ils gardent toutes leurs fonctionnalités sans abonnement.</>}
          {' '}<Link to="/tarifs-abonnement-presence/medecin">Activer ou désactiver par pays</Link>.
        </div>
      )}
      {erreur && <div className="alert alert-danger">{erreur}</div>}

      {tableau && (
        <div className="row g-3 mb-3">
          <Kpi icone={config.icone} variante="is-success" libelle="Abonnés actifs" valeur={tableau.abonnes_actifs}
            detail={Object.entries(tableau.abonnes_par_niveau).map(([n, c]) => `${n} : ${c}`).join(' · ') || null} />
          <Kpi icone="fa-hourglass-half" variante="is-warning" libelle="Échéances à 30 jours" valeur={tableau.echeances_30_jours} />
          <Kpi icone="fa-sack-dollar" variante="is-primary" libelle="Revenus facturés"
            valeur={tableau.revenus_par_devise.length
              ? tableau.revenus_par_devise.map((r) => montantDevise(r.total, r.devise)).join(' · ')
              : '—'}
            detail="Par devise, jamais additionnés" />
          <Kpi icone="fa-arrows-rotate" variante="is-info" libelle="Renouvellement (90 j)"
            valeur={tableau.renouvellement_90_jours.taux === null ? '—' : `${tableau.renouvellement_90_jours.taux} %`}
            detail={`${tableau.renouvellement_90_jours.renouveles} / ${tableau.renouvellement_90_jours.echeances} échéances`} />
        </div>
      )}

      <div className="aps-card">
        <div className="aps-toolbar p-3 d-flex gap-2 flex-wrap">
          <select className="form-select" style={{ maxWidth: 220 }} value={filtres.statut} onChange={(e) => setFiltres({ ...filtres, statut: e.target.value, echeance_jours: '' })}>
            <option value="">Tous les statuts</option>
            {Object.entries(STATUTS_ABONNEMENT).map(([v, s]) => <option key={v} value={v}>{s.libelle}</option>)}
          </select>
          <select className="form-select" style={{ maxWidth: 220 }} value={filtres.pays_id} onChange={(e) => setFiltres({ ...filtres, pays_id: e.target.value })}>
            <option value="">Tous les pays</option>
            {pays.map((p) => <option key={p.pays_id} value={p.pays_id}>{p.nom}</option>)}
          </select>
          <select className="form-select" style={{ maxWidth: 220 }} value={filtres.echeance_jours} onChange={(e) => setFiltres({ ...filtres, echeance_jours: e.target.value, statut: '' })}>
            <option value="">Toutes échéances</option>
            <option value="7">Échéance sous 7 jours</option>
            <option value="30">Échéance sous 30 jours</option>
          </select>
        </div>
        <div className="aps-table-wrap">
          <table className="table aps-table">
            <thead>
              <tr>
                <th>{config.singulier}</th><th>Niveau</th><th>Période</th><th className="text-end">Montant</th><th>Statut</th><th>Origine</th><th className="text-end">Actions</th>
              </tr>
            </thead>
            <tbody>
              {chargement ? (
                <tr><td colSpan={7}><div className="aps-empty-mini">Chargement…</div></td></tr>
              ) : abonnements.length === 0 ? (
                <tr><td colSpan={7}><div className="aps-empty-mini">Aucun abonnement.</div></td></tr>
              ) : abonnements.map((a) => {
                const st = STATUTS_ABONNEMENT[a.statut] ?? {};
                return (
                  <tr key={a.abonnement_id}>
                    <td>
                      <strong>{a.fiche?.nom ?? '—'}</strong>
                      <div className="small aps-text-muted">{a.fiche?.pays?.nom}</div>
                    </td>
                    <td>{a.niveau?.libelle}<div className="small aps-text-muted">{a.duree_mois} mois</div></td>
                    <td className="small">
                      {a.date_debut ? <>{dateCourte(a.date_debut)} → {dateCourte(dernierJourCouvert(a.date_fin))}</> : '—'}
                    </td>
                    <td className="text-end">
                      {montantDevise(a.montant_total, a.devise)}
                      {a.facture?.numero && <div className="small aps-text-muted">{a.facture.numero}</div>}
                    </td>
                    <td><span className={`aps-badge ${st.badge ?? 'is-neutral'}`}>{st.libelle ?? a.statut}</span></td>
                    <td className="small">{ORIGINES_ABONNEMENT[a.origine] ?? a.origine}{a.motif && <div className="aps-text-muted" title={a.motif}>{a.motif.slice(0, 40)}</div>}</td>
                    <td className="text-end text-nowrap">
                      {a.statut === 'en_attente_paiement' && a.origine === 'virement' && (
                        <button className="btn btn-sm btn-primary me-1" onClick={() => ouvrir('encaissement', a)}>Encaissement constaté</button>
                      )}
                      {a.statut === 'actif' && (
                        <button className="btn btn-sm btn-light me-1" title="Suspendre" onClick={() => ouvrir('suspendre', a)}><i className="fa-solid fa-pause"></i></button>
                      )}
                      {a.statut === 'suspendu' && (
                        <button className="btn btn-sm btn-light me-1" title="Rétablir" onClick={() => ouvrir('retablir', a)}><i className="fa-solid fa-play"></i></button>
                      )}
                      {['actif', 'suspendu'].includes(a.statut) && (
                        <button className="btn btn-sm btn-light" title="Prolonger" onClick={() => ouvrir('prolonger', a)}><i className="fa-solid fa-calendar-plus"></i></button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <FondsModal
        titre={action ? TITRES[action.type] : ''}
        ouvert={!!action}
        occupe={envoi}
        onFermer={fermer}
        pied={
          <>
            <button className="btn btn-light" onClick={fermer} disabled={envoi}>Annuler</button>
            <button className="btn btn-primary" type="submit" form="form-abonnement-presence" disabled={envoi}>
              {envoi && <span className="spinner-border spinner-border-sm me-2" />}Valider
            </button>
          </>
        }
      >
        {action && (
          <form id="form-abonnement-presence" onSubmit={valider}>
            {erreurForm && <div className="alert alert-danger">{erreurForm}</div>}

            {action.abonnement && (
              <p className="mb-3">
                <strong>{action.abonnement.fiche?.nom}</strong> — {action.abonnement.niveau?.libelle},{' '}
                {montantDevise(action.abonnement.montant_total, action.abonnement.devise)}
              </p>
            )}

            {action.type === 'nouveau' && (
              <>
                <div className="mb-2">
                  <label className="form-label" htmlFor="np-fiche">{config.singulier} (fiches publiées)</label>
                  <select id="np-fiche" className="form-select" required value={form.acteur_id} onChange={(e) => maj('acteur_id', e.target.value)}>
                    <option value="">— Choisir —</option>
                    {refs.fiches.map((f) => (
                      <option key={f.acteur_id} value={f.acteur_id}>
                        {f.nom} ({f.pays?.nom}){f.statut_abonnement === 'actif' ? ` — ${f.niveau_presence}` : f.statut_abonnement === 'gratuite' ? ' — offert (amorçage)' : ''} · {f.vues_30_jours} vue(s) / 30 j
                      </option>
                    ))}
                  </select>
                  {type === 'medecin' && (
                    <small className="aps-text-muted">Seuls les médecins des pays où l&apos;abonnement est obligatoire sont listés.</small>
                  )}
                </div>
                <div className="row g-2 mb-2">
                  <div className="col-7">
                    <label className="form-label" htmlFor="np-niveau">Niveau</label>
                    <select id="np-niveau" className="form-select" required value={form.niveau_id} onChange={(e) => maj('niveau_id', e.target.value)}>
                      <option value="">— Choisir —</option>
                      {refs.niveaux.map((n) => <option key={n.niveau_id} value={n.niveau_id}>{n.libelle}</option>)}
                    </select>
                  </div>
                  <div className="col-5">
                    <label className="form-label" htmlFor="np-duree">Durée</label>
                    <select id="np-duree" className="form-select" required value={form.duree_mois} onChange={(e) => maj('duree_mois', e.target.value)}>
                      <option value="">—</option>
                      {refs.remises.map((r) => (
                        <option key={r.duree_mois} value={r.duree_mois}>
                          {r.duree_mois} mois{Number(r.remise_pourcent) > 0 ? ` (-${Number(r.remise_pourcent)} %)` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="mb-2">
                  <label className="form-label d-block">Mode</label>
                  <div className="form-check form-check-inline">
                    <input id="np-geste" type="radio" className="form-check-input" checked={form.origine === 'geste'} onChange={() => maj('origine', 'geste')} />
                    <label className="form-check-label" htmlFor="np-geste">Geste commercial (gratuit, activé tout de suite)</label>
                  </div>
                  <div className="form-check form-check-inline">
                    <input id="np-virement" type="radio" className="form-check-input" checked={form.origine === 'virement'} onChange={() => maj('origine', 'virement')} />
                    <label className="form-check-label" htmlFor="np-virement">Virement (prix de la grille)</label>
                  </div>
                </div>
                {form.duree_mois && remiseDe(form.duree_mois) && Number(remiseDe(form.duree_mois).remise_pourcent) > 0 && (
                  <p className="small aps-text-muted">Remise de durée appliquée : {Number(remiseDe(form.duree_mois).remise_pourcent)} %.</p>
                )}
                <div>
                  <label className="form-label" htmlFor="np-motif">Motif {form.origine === 'geste' ? '(obligatoire)' : '(facultatif)'}</label>
                  <textarea id="np-motif" className="form-control" rows={2} required={form.origine === 'geste'} value={form.motif} onChange={(e) => maj('motif', e.target.value)} />
                </div>
              </>
            )}

            {action.type === 'encaissement' && (
              <>
                <p className="small">
                  Confirmez que le virement de <strong>{montantDevise(action.abonnement.montant_total, action.abonnement.devise)}</strong> a
                  bien été reçu. L&apos;abonnement est activé et une facture numérotée est émise.
                </p>
                <label className="form-label" htmlFor="ep-ref">Référence du virement (facultatif)</label>
                <input id="ep-ref" className="form-control" value={form.reference_virement} onChange={(e) => maj('reference_virement', e.target.value)} />
              </>
            )}

            {(action.type === 'suspendre' || action.type === 'retablir') && (
              <>
                <p className="small">
                  {action.type === 'suspendre'
                    ? 'La fiche repasse immédiatement au palier Basique (incident éthique, plainte…). La suspension ne prolonge pas l’abonnement.'
                    : 'Les dates de l’abonnement sont inchangées.'}
                </p>
                <label className="form-label" htmlFor="sp-motif">Motif (journalisé)</label>
                <textarea id="sp-motif" className="form-control" rows={2} value={form.motif} onChange={(e) => maj('motif', e.target.value)} />
              </>
            )}

            {action.type === 'prolonger' && (
              <>
                <p className="small">Fin actuelle : dernier jour couvert le <strong>{dateCourte(dernierJourCouvert(action.abonnement.date_fin))}</strong>.</p>
                <div className="row g-2 mb-2">
                  <div className="col-6">
                    <label className="form-label" htmlFor="pp-mois">Mois</label>
                    <input id="pp-mois" type="number" min="0" max="24" step="1" className="form-control" value={form.mois} onChange={(e) => maj('mois', e.target.value)} />
                  </div>
                  <div className="col-6">
                    <label className="form-label" htmlFor="pp-jours">Jours</label>
                    <input id="pp-jours" type="number" min="0" max="365" step="1" className="form-control" value={form.jours} onChange={(e) => maj('jours', e.target.value)} />
                  </div>
                </div>
                <label className="form-label" htmlFor="pp-motif">Motif (obligatoire)</label>
                <textarea id="pp-motif" className="form-control" rows={2} required value={form.motif} onChange={(e) => maj('motif', e.target.value)} />
              </>
            )}
          </form>
        )}
      </FondsModal>
    </main>
  );
}
