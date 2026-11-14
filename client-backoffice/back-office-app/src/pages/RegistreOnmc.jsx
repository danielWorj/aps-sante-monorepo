// src/pages/RegistreOnmc.jsx
// Tableau de l'Ordre National des Médecins du Cameroun (ONMC) : état de la
// copie locale du registre public (https://onmc.app/tableau_de_lordre),
// lancement d'une synchronisation, historique, vérification d'un numéro
// d'ordre et consultation des fiches synchronisées.
import { useCallback, useEffect, useState } from 'react';
import { useToast } from '../components/feedback';
import './../assets/style/Referentiel.css';
import {
  lancerSynchronisationOnmc,
  listerRegistreOnmc,
  obtenirEtatOnmc,
  verifierNumeroOrdre,
} from '../services/onmcService';

const LIBELLE_STATUT = { en_cours: 'En cours', reussie: 'Réussie', echouee: 'Échouée' };
const BADGE_STATUT = { en_cours: 'is-warning', reussie: 'is-success', echouee: 'is-danger' };

const dateHeure = (iso) =>
  iso ? new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
const nombre = (n) => (n ?? n === 0 ? Number(n).toLocaleString('fr-FR') : '—');

export default function RegistreOnmc() {
  const toast = useToast();
  const [etat, setEtat] = useState(null);
  const [erreurEtat, setErreurEtat] = useState(null);
  const [lancement, setLancement] = useState(false);

  const [recherche, setRecherche] = useState('');
  const [page, setPage] = useState(1);
  const [registre, setRegistre] = useState(null);
  const [erreurRegistre, setErreurRegistre] = useState(null);

  const [verif, setVerif] = useState({ numero: '', nom: '', enCours: false, resultat: null, erreur: null });

  const chargerEtat = useCallback(
    () =>
      obtenirEtatOnmc()
        .then((d) => { setEtat(d); setErreurEtat(null); })
        .catch((err) => setErreurEtat(err.message || "Impossible de charger l'état du registre.")),
    []
  );
  useEffect(() => { chargerEtat(); }, [chargerEtat]);

  // Pendant une synchronisation : actualisation toutes les 5 s.
  const enCours = Boolean(etat?.synchronisation_en_cours);
  useEffect(() => {
    if (!enCours) return undefined;
    const minuteur = setInterval(chargerEtat, 5000);
    return () => clearInterval(minuteur);
  }, [enCours, chargerEtat]);

  // Recherche différée (300 ms) ; rechargée à la fin d'une synchronisation.
  useEffect(() => {
    const minuteur = setTimeout(() => {
      listerRegistreOnmc({ recherche, page })
        .then((d) => { setRegistre(d); setErreurRegistre(null); })
        .catch((err) => setErreurRegistre(err.message || 'Chargement impossible.'));
    }, 300);
    return () => clearTimeout(minuteur);
  }, [recherche, page, etat?.derniere_synchronisation_reussie]);

  async function synchroniser() {
    setLancement(true);
    try {
      await lancerSynchronisationOnmc();
      toast.succes('Synchronisation lancée : lecture du registre ONMC en cours (environ une minute).');
      await chargerEtat();
    } catch (err) {
      toast.erreur(err.message || 'Impossible de lancer la synchronisation.');
    } finally {
      setLancement(false);
    }
  }

  async function verifier(e) {
    e.preventDefault();
    if (!verif.numero.trim()) return;
    setVerif((v) => ({ ...v, enCours: true, resultat: null, erreur: null }));
    try {
      const resultat = await verifierNumeroOrdre(verif.numero, verif.nom);
      setVerif((v) => ({ ...v, enCours: false, resultat }));
    } catch (err) {
      setVerif((v) => ({
        ...v,
        enCours: false,
        erreur:
          err.status === 502
            ? "Le site de l'ONMC est injoignable et aucune copie locale n'est disponible. Cela ne signifie pas que le médecin n'est pas inscrit."
            : err.message || 'Vérification impossible.',
      }));
    }
  }

  const derniere = etat?.historique?.[0];
  const fiches = registre?.fiches || [];
  const nbPages = registre ? Math.max(1, Math.ceil(registre.total / registre.par_page)) : 1;
  const r = verif.resultat;

  return (
    <main className="aps-content">
      <div className="aps-page-header">
        <div>
          <div className="aps-breadcrumb">Back-office <span className="sep">/</span> Annuaire de santé <span className="sep">/</span> Registre ONMC</div>
          <h1>Tableau de l'Ordre (ONMC)</h1>
        </div>
        <div className="d-flex gap-2">
          <button className="btn btn-light" onClick={chargerEtat}>
            <i className="fa-solid fa-rotate me-2"></i>Actualiser
          </button>
          <button className="btn btn-primary" onClick={synchroniser} disabled={lancement || enCours}>
            {enCours || lancement ? (
              <><span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Synchronisation…</>
            ) : (
              <><i className="fa-solid fa-cloud-arrow-down me-2"></i>Synchroniser maintenant</>
            )}
          </button>
        </div>
      </div>

      <p className="aps-text-muted">
        Copie locale du registre public de l'Ordre National des Médecins du Cameroun, relue chaque lundi à 02h30 (UTC).
        Les médecins exerçant au Cameroun sont rapprochés par numéro d'ordre : badge « Appartient à l'Ordre » ou
        « N'est pas dans l'Ordre » sur les listes.
      </p>
      {erreurEtat && <div className="alert alert-danger">{erreurEtat}</div>}

      {/* Indicateurs */}
      <div className="row g-3 mb-3">
        {[
          { titre: 'Fiches au registre', valeur: nombre(etat?.total_registre), badge: 'is-info', icone: 'fa-book-medical' },
          { titre: "Médecins dans l'Ordre", valeur: nombre(etat?.medecins?.inscrit), badge: 'is-success', icone: 'fa-shield-halved' },
          { titre: "Médecins hors de l'Ordre", valeur: nombre(etat?.medecins?.non_inscrit), badge: 'is-danger', icone: 'fa-circle-xmark' },
          { titre: 'Non vérifiés (hors Cameroun…)', valeur: nombre(etat?.medecins?.non_verifie), badge: 'is-neutral', icone: 'fa-circle-question' },
        ].map((k) => (
          <div className="col-6 col-xl-3" key={k.titre}>
            <div className="aps-card p-3 h-100">
              <span className={`aps-badge ${k.badge}`}><i className={`fa-solid ${k.icone}`}></i> {k.titre}</span>
              <div className="mt-2" style={{ fontSize: 26, fontWeight: 700 }}>{k.valeur}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="row g-3">
        {/* Synchronisations */}
        <div className="col-12 col-xl-7">
          <div className="aps-card">
            <div className="p-3 d-flex justify-content-between align-items-center flex-wrap gap-2">
              <h5 className="mb-0">Synchronisations</h5>
              <span className="aps-text-muted" style={{ fontSize: 13 }}>
                Dernière réussie : {dateHeure(etat?.derniere_synchronisation_reussie)}
              </span>
            </div>
            {derniere?.statut === 'en_cours' && (
              <div className="aps-notice is-info mx-3 mb-3">
                <i className="fa-solid fa-spinner fa-spin"></i>
                <div>
                  Lecture en cours : {nombre(derniere.pages_lues)} page(s), {nombre(derniere.total_recupere)} fiche(s) lues.
                </div>
              </div>
            )}
            <div className="aps-table-wrap">
              <table className="table aps-table">
                <thead>
                  <tr><th>Démarrée le</th><th>Statut</th><th>Fiches lues</th><th>Rapprochement</th><th>Origine</th></tr>
                </thead>
                <tbody>
                  {!etat && !erreurEtat ? (
                    <tr><td colSpan={5}><div className="aps-empty-mini">Chargement…</div></td></tr>
                  ) : !etat?.historique?.length ? (
                    <tr><td colSpan={5}><div className="aps-empty-mini">Aucune synchronisation pour l'instant.</div></td></tr>
                  ) : etat.historique.map((s) => (
                    <tr key={s.synchronisation_onmc_id}>
                      <td style={{ whiteSpace: 'nowrap' }}>{dateHeure(s.demarree_le)}</td>
                      <td>
                        <span className={`aps-badge ${BADGE_STATUT[s.statut]}`}>{LIBELLE_STATUT[s.statut]}</span>
                        {s.erreur && <div className="aps-text-muted mt-1" style={{ fontSize: 12, maxWidth: 280 }}>{s.erreur}</div>}
                      </td>
                      <td>
                        {nombre(s.total_recupere)}
                        {s.total_annonce ? <span className="aps-text-muted"> / {nombre(s.total_annonce)}</span> : null}
                      </td>
                      <td style={{ fontSize: 13 }}>
                        {s.statut === 'reussie' ? (
                          <>
                            <span className="text-success">{nombre(s.medecins_inscrits)} inscrits</span>
                            {' · '}
                            <span className="text-danger">{nombre(s.medecins_non_inscrits)} hors Ordre</span>
                          </>
                        ) : '—'}
                      </td>
                      <td className="aps-text-muted" style={{ fontSize: 13 }}>
                        {s.declenchee_par === 'planifiee' ? 'Planifiée' : 'Manuelle'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Vérification d'un numéro */}
        <div className="col-12 col-xl-5">
          <div className="aps-card p-3">
            <h5 className="mb-3">Vérifier un numéro d'ordre</h5>
            <form onSubmit={verifier} className="row g-2">
              <div className="col-12 col-sm-5">
                <label className="form-label" htmlFor="onmc-numero">N° d'ordre</label>
                <input id="onmc-numero" className="form-control" placeholder="0000/0000" value={verif.numero}
                  onChange={(e) => setVerif((v) => ({ ...v, numero: e.target.value }))} />
              </div>
              <div className="col-12 col-sm-7">
                <label className="form-label" htmlFor="onmc-nom">Nom (facultatif)</label>
                <input id="onmc-nom" className="form-control" placeholder="Nom et prénoms" value={verif.nom}
                  onChange={(e) => setVerif((v) => ({ ...v, nom: e.target.value }))} />
              </div>
              <div className="col-12">
                <button className="btn btn-outline-primary w-100" type="submit" disabled={verif.enCours || !verif.numero.trim()}>
                  {verif.enCours ? (
                    <><span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>Vérification…</>
                  ) : (
                    <><i className="fa-solid fa-shield-halved me-1"></i>Vérifier</>
                  )}
                </button>
              </div>
            </form>

            {verif.erreur && (
              <div className="aps-notice is-warning mt-3"><i className="fa-solid fa-triangle-exclamation"></i><div>{verif.erreur}</div></div>
            )}
            {r && (
              r.appartient_ordre ? (
                <div className="aps-notice is-success mt-3">
                  <i className="fa-solid fa-circle-check"></i>
                  <div>
                    <strong>Appartient à l'Ordre</strong>
                    {r.correspondances.map((c) => (
                      <div key={`${c.numero_ordre}-${c.nom_complet}`} className="d-flex align-items-center gap-2 mt-2">
                        {c.photo_url && <img src={c.photo_url} alt="" width={36} height={36} style={{ borderRadius: '50%', objectFit: 'cover' }} />}
                        <div>
                          {c.nom_complet} <span className="aps-text-muted">({c.numero_ordre} · {c.qualite})</span>
                        </div>
                      </div>
                    ))}
                    {r.nom_correspond === false && (
                      <div className="text-warning mt-2"><i className="fa-solid fa-triangle-exclamation me-1"></i>Le nom saisi ne correspond pas au nom inscrit.</div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="aps-notice is-danger mt-3">
                  <i className="fa-solid fa-circle-xmark"></i>
                  <div>
                    <strong>N'est pas dans l'Ordre</strong> : numéro introuvable au tableau de l'ONMC.
                    {r.verification_directe_indisponible && (
                      <div className="mt-1">Site de l'ONMC injoignable : résultat basé sur la copie du {dateHeure(r.registre_synchronise_le)}.</div>
                    )}
                  </div>
                </div>
              )
            )}
            {r && (
              <div className="aps-text-muted mt-2" style={{ fontSize: 12 }}>
                Source : {r.source === 'onmc_direct' ? "site de l'ONMC (recherche directe)" : `copie locale du ${dateHeure(r.registre_synchronise_le)}`}
              </div>
            )}
          </div>
        </div>

        {/* Fiches synchronisées */}
        <div className="col-12">
          <div className="aps-card">
            <div className="aps-toolbar">
              <div className="aps-search">
                <i className="fa-solid fa-magnifying-glass"></i>
                <input type="text" placeholder="Nom ou numéro d'ordre…" value={recherche}
                  onChange={(e) => { setRecherche(e.target.value); setPage(1); }} />
              </div>
              <span className="aps-text-muted ms-auto" style={{ fontSize: 13 }}>{nombre(registre?.total)} fiche(s)</span>
            </div>
            {erreurRegistre && <div className="alert alert-danger m-3">{erreurRegistre}</div>}
            <div className="aps-table-wrap">
              <table className="table aps-table">
                <thead>
                  <tr><th>Médecin</th><th>N° d'ordre</th><th>Qualité</th></tr>
                </thead>
                <tbody>
                  {!registre && !erreurRegistre ? (
                    <tr><td colSpan={3}><div className="aps-empty-mini">Chargement…</div></td></tr>
                  ) : fiches.length === 0 ? (
                    <tr><td colSpan={3}><div className="aps-empty-mini">
                      {etat?.total_registre ? 'Aucune fiche ne correspond.' : 'Registre vide : lancez une synchronisation.'}
                    </div></td></tr>
                  ) : fiches.map((f) => (
                    <tr key={`${f.numero_ordre}-${f.nom_complet}`}>
                      <td>
                        <div className="aps-avatar-cell">
                          {f.photo_url ? (
                            <img src={f.photo_url} alt="" loading="lazy" />
                          ) : (
                            <span className="d-inline-flex align-items-center justify-content-center"
                              style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--aps-primary-100)', color: 'var(--aps-primary)' }}>
                              <i className="fa-solid fa-user-doctor"></i>
                            </span>
                          )}
                          <div className="cell-title">{f.nom_complet}</div>
                        </div>
                      </td>
                      <td>{f.numero_ordre}</td>
                      <td>{f.qualite}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {registre && nbPages > 1 && (
              <div className="d-flex justify-content-between align-items-center p-3">
                <span className="aps-text-muted">Page {registre.page} / {nbPages}</span>
                <div className="d-flex gap-2">
                  <button className="btn btn-sm btn-light" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Précédent</button>
                  <button className="btn btn-sm btn-light" disabled={page >= nbPages} onClick={() => setPage((p) => p + 1)}>Suivant</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
