// src/pages/Publicite.jsx
//
// Publicité — réservations d'espace soumises par les annonceurs (v9).
//
//   - Onglets par statut (compteurs du serveur) : à modérer, à payer,
//     payées, non payées à temps, rejetées, annulées.
//   - Détail : visuel, contenu affiché, informations de l'annonceur,
//     emplacement / position / période, montant, statistiques.
//   - Accepter (date de début modifiable si la date demandée est passée ou
//     prise) : la place est bloquée jusqu'au paiement et l'annonceur reçoit
//     le lien de paiement par le canal qu'il a choisi (WhatsApp, SMS ou
//     e-mail). Rejeter : motif obligatoire, envoyé par ce même canal. Les
//     textes (communs aux trois canaux) se modifient dans Configuration > WhatsApp.
//   - Paiements tardifs (place reprise entre-temps) : remboursement manuel.
//   - Modifier (contenu affiché, visuel, annonceur) et Supprimer, quel que
//     soit le statut : une publicité avec historique de paiement n'est pas
//     effacée mais retirée de la diffusion (facture conservée).
import { useCallback, useEffect, useState } from 'react';
import { useConfirmation, useSaisie, useToast } from '../components/feedback';
import './../assets/style/Referentiel.css';
import FondsModal from '../components/FondsModal';
import {
  STATUTS_PUBLICITE,
  accepterPublicite,
  listerPaiementsTardifsPublicite,
  listerReservationsPublicitaires,
  modifierPublicite,
  obtenirFacturePublicite,
  obtenirStatistiquesPublicite,
  rejeterPublicite,
  supprimerPublicite,
  traiterPaiementTardifPublicite,
} from '../services/publiciteService';
import { dateHeure, montantDevise } from '../utils/fonds';

const ONGLETS = ['en_moderation', 'en_attente_paiement', 'payee', 'expiree', 'rejetee', 'annulee'];

const jour = (iso) => (iso ? new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString('fr-FR', { timeZone: 'UTC' }) : '—');
/** date_fin est exclue côté serveur : on affiche le dernier jour de diffusion. */
const dernierJour = (iso) => {
  if (!iso) return '—';
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toLocaleDateString('fr-FR', { timeZone: 'UTC' });
};
const position = (r) => (Number(r) === 1 ? '1re position' : `${r}e position`);
const aujourdhuiIso = () => new Date().toISOString().slice(0, 10);

const CHAMPS_EDITION = [
  { cle: 'titre', libelle: 'Titre', requis: true, max: 150 },
  { cle: 'description', libelle: 'Description', type: 'textarea' },
  { cle: 'telephone_contact', libelle: 'Téléphone affiché', max: 30 },
  { cle: 'email_contact', libelle: 'E-mail affiché', type: 'email', max: 150 },
  { cle: 'localisation', libelle: 'Localisation', max: 255 },
  { cle: 'annonceur_nom', libelle: "Nom de l'annonceur", max: 150 },
  { cle: 'annonceur_entreprise', libelle: 'Entreprise', max: 150 },
  { cle: 'annonceur_telephone', libelle: 'Téléphone annonceur', max: 30 },
  { cle: 'annonceur_email', libelle: 'E-mail annonceur', type: 'email', max: 150 },
  { cle: 'canal_notification', libelle: 'Canal de notification', type: 'canal' },
];
// Canal par lequel l'annonceur reçoit décision, lien de paiement et facture.
const CANAUX = { whatsapp: 'WhatsApp', sms: 'SMS', email: 'E-mail' };
const formulaireDepuis = (p) => Object.fromEntries(CHAMPS_EDITION.map(({ cle }) => [cle, p[cle] ?? '']));
/** Payée : la suppression devient un retrait de diffusion (facture conservée). */
const aHistoriquePaiement = (p) => !!p.facture || p.statut === 'payee';

export default function Publicite() {
  const confirmer = useConfirmation();
  const saisir = useSaisie();
  const toast = useToast();
  const [onglet, setOnglet] = useState('en_moderation');
  const [recherche, setRecherche] = useState('');
  const [donnees, setDonnees] = useState({ publicites: [], compteurs: {} });
  const [chargement, setChargement] = useState(true);

  const [detail, setDetail] = useState(null);
  const [stats, setStats] = useState(null);
  const [facture, setFacture] = useState(null);
  const [decision, setDecision] = useState(null); // null | 'accepter' | 'rejeter' | 'modifier'
  const [formulaire, setFormulaire] = useState({});
  const [visuel, setVisuel] = useState(null);
  const [dateDebut, setDateDebut] = useState('');
  const [motif, setMotif] = useState('');
  const [occupe, setOccupe] = useState(false);
  const [erreurDecision, setErreurDecision] = useState(null);

  const [tardifs, setTardifs] = useState([]);

  const charger = useCallback(async () => {
    setChargement(true);
    try {
      setDonnees(await listerReservationsPublicitaires({ statut: onglet, recherche: recherche.trim() }));
    } catch (err) {
      toast.erreur(err.message || 'Chargement impossible.');
    } finally {
      setChargement(false);
    }
  }, [onglet, recherche, toast]);

  const chargerTardifs = useCallback(() => {
    listerPaiementsTardifsPublicite().then(setTardifs).catch(() => setTardifs([]));
  }, []);

  useEffect(() => {
    const t = setTimeout(charger, 250);
    return () => clearTimeout(t);
  }, [charger]);
  useEffect(() => { chargerTardifs(); }, [chargerTardifs]);

  const ouvrirDetail = (p, mode = null) => {
    setDetail(p);
    setDecision(mode);
    setFormulaire(formulaireDepuis(p));
    setVisuel(null);
    setErreurDecision(null);
    setMotif('');
    setDateDebut(p.date_debut >= aujourdhuiIso() ? p.date_debut : aujourdhuiIso());
    setStats(null);
    setFacture(null);
    if (['payee', 'expiree'].includes(p.statut)) {
      obtenirStatistiquesPublicite(p.publicite_id).then(setStats).catch(() => setStats(null));
    }
    if (p.facture) obtenirFacturePublicite(p.publicite_id).then(setFacture).catch(() => setFacture(null));
  };

  const decider = async () => {
    setOccupe(true);
    setErreurDecision(null);
    try {
      const r = decision === 'accepter'
        ? await accepterPublicite(detail.publicite_id, dateDebut !== detail.date_debut ? dateDebut : undefined)
        : await rejeterPublicite(detail.publicite_id, motif.trim());
      toast.succes(r.message);
      setDetail(null);
      await charger();
    } catch (err) {
      const libre = err.data?.details?.prochaine_date_libre;
      setErreurDecision(`${err.message}${libre ? ` Prochaine date libre : ${jour(libre)}.` : ''}`);
      if (libre) setDateDebut(libre);
    } finally {
      setOccupe(false);
    }
  };

  const enregistrer = async () => {
    setOccupe(true);
    setErreurDecision(null);
    try {
      // Seuls les champs modifiés partent (le serveur ignore les champs vides).
      const changes = Object.fromEntries(
        Object.entries(formulaire).filter(([k, v]) => String(v ?? '').trim() !== String(detail[k] ?? '').trim()),
      );
      if (visuel) changes.visuel = visuel;
      if (!Object.keys(changes).length) { setDecision(null); return; }
      await modifierPublicite(detail.publicite_id, changes);
      toast.succes('Publicité mise à jour.');
      setDetail(null);
      await charger();
    } catch (err) {
      setErreurDecision(err.message || 'Mise à jour impossible.');
    } finally {
      setOccupe(false);
    }
  };

  const supprimer = async (p) => {
    const ok = await confirmer(aHistoriquePaiement(p)
      ? {
          titre: 'Retirer la publicité',
          message: `« ${p.titre} » a un paiement : elle sera retirée de la diffusion et conservée avec sa facture (onglet Annulée).`,
          labelConfirmer: 'Retirer',
          variante: 'avertissement',
        }
      : {
          titre: 'Supprimer la publicité',
          message: `« ${p.titre} » sera supprimée définitivement.`,
          labelConfirmer: 'Supprimer',
          variante: 'danger',
        });
    if (!ok) return;
    try {
      const r = await supprimerPublicite(p.publicite_id);
      toast.succes(r?.message || 'Publicité supprimée.');
      setDetail(null);
      await charger();
    } catch (err) {
      toast.erreur(err.message || 'Suppression impossible.');
    }
  };

  const traiterTardif = async (r) => {
    let frais;
    if (r.transaction.fournisseur !== 'stripe') {
      const saisie = await saisir({
        titre: 'Remboursement Mobile Money',
        message: 'Fonds renvoyés à la main par Mobile Money.',
        label: 'Frais réels supportés (FCFA)',
        type: 'number',
        min: 0,
        valeurInitiale: '0',
        obligatoire: true,
        valider: (v) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? null : 'Montant invalide.'),
        labelConfirmer: 'Enregistrer',
      });
      if (saisie === null) return;
      frais = Number(saisie);
    } else if (!(await confirmer({
      titre: 'Rembourser chez Stripe',
      message: 'Ce paiement sera remboursé via Stripe.',
      labelConfirmer: 'Rembourser',
      variante: 'avertissement',
    }))) return;
    try {
      await traiterPaiementTardifPublicite(r.remboursement_id, frais);
      toast.succes('Remboursement enregistré.');
      chargerTardifs();
    } catch (err) {
      toast.erreur(err.message || 'Traitement impossible.');
    }
  };

  const { publicites, compteurs } = donnees;
  const s = detail ? STATUTS_PUBLICITE[detail.statut] : null;

  return (
    <main className="aps-content">
      <div className="aps-page-header">
        <div>
          <div className="aps-breadcrumb">
            Back-office <span className="sep">/</span> Publicité <span className="sep">/</span> Réservations
          </div>
          <h1>Réservations publicitaires</h1>
        </div>
        <button className="btn btn-light" onClick={() => { charger(); chargerTardifs(); }} disabled={chargement}>
          <i className="fa-solid fa-rotate me-2"></i>Actualiser
        </button>
      </div>

      <p className="aps-text-muted">
        Les annonceurs réservent une position dans le slider d'une page. Une demande acceptée bloque la place
        jusqu'au paiement ; l'annonceur reçoit la décision par le canal qu'il a choisi — WhatsApp, SMS ou
        e-mail (textes communs modifiables dans <a href="/whatsapp">Configuration &gt; WhatsApp</a>, journaux
        dans <a href="/sms">SMS</a> et <a href="/email">E-mail</a>).
      </p>

      {tardifs.length > 0 && (
        <div className="aps-card mb-3 p-3">
          <h2 className="h6 text-danger">
            <i className="fa-solid fa-triangle-exclamation me-2"></i>Paiements tardifs à rembourser ({tardifs.length})
          </h2>
          <p className="aps-text-muted small">Paiement reçu alors que la place avait été reprise ou la demande close.</p>
          <div className="aps-table-wrap">
            <table className="table aps-table mb-0">
              <thead><tr><th>Date</th><th>Publicité</th><th>Annonceur</th><th>Moyen</th><th>Montant</th><th></th></tr></thead>
              <tbody>
                {tardifs.map((r) => (
                  <tr key={r.remboursement_id}>
                    <td>{dateHeure(r.date_creation)}</td>
                    <td>{r.publicite?.titre ?? '—'}</td>
                    <td>{r.publicite?.annonceur_nom ?? '—'}<small className="d-block aps-text-muted">{r.publicite?.annonceur_telephone}</small></td>
                    <td>{r.transaction.fournisseur === 'stripe' ? 'Carte' : `Mobile Money ${r.transaction.numero_payeur ?? ''}`}</td>
                    <td>{montantDevise(r.montant, r.transaction.devise)}</td>
                    <td className="text-end"><button className="btn btn-sm btn-outline-danger" onClick={() => traiterTardif(r)}>Rembourser</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="aps-card">
        <div className="aps-card__body">
          <div className="d-flex flex-wrap gap-2 justify-content-between align-items-center mb-3">
            <div className="btn-group flex-wrap" role="tablist">
              {ONGLETS.map((k) => (
                <button key={k} type="button" role="tab" aria-selected={onglet === k}
                  className={`btn btn-sm ${onglet === k ? 'btn-primary' : 'btn-light'}`} onClick={() => setOnglet(k)}>
                  {STATUTS_PUBLICITE[k].libelle}
                  <span className="ms-1 opacity-75">({compteurs[k] ?? 0})</span>
                </button>
              ))}
            </div>
            <div className="aps-search" style={{ minWidth: 260 }}>
              <i className="fa-solid fa-magnifying-glass"></i>
              <input type="text" placeholder="Titre, annonceur, entreprise…" value={recherche}
                onChange={(e) => setRecherche(e.target.value)} aria-label="Recherche" />
            </div>
          </div>

          <div className="aps-table-wrap">
            <table className="table aps-table">
              <thead>
                <tr>
                  <th>Visuel</th><th>Publicité</th><th>Annonceur</th><th>Emplacement</th><th>Période</th>
                  <th>Montant</th><th>Statistiques</th><th className="text-end">Actions</th>
                </tr>
              </thead>
              <tbody>
                {chargement ? (
                  <tr><td colSpan={8}><div className="aps-empty-mini">Chargement…</div></td></tr>
                ) : publicites.length === 0 ? (
                  <tr><td colSpan={8} className="aps-text-muted">Aucune demande dans cet onglet.</td></tr>
                ) : publicites.map((p) => (
                  <tr key={p.publicite_id}>
                    <td>
                      <img src={p.visuel_url} alt="" style={{ width: 64, height: 40, objectFit: 'cover', borderRadius: 6 }} />
                    </td>
                    <td>
                      <span className="cell-title">{p.titre}</span>
                      <small className="aps-text-muted d-block">Soumise le {dateHeure(p.date_soumission)}</small>
                    </td>
                    <td>
                      {p.annonceur_nom ?? `${p.utilisateur?.prenom ?? ''} ${p.utilisateur?.nom ?? ''}`}
                      {p.annonceur_entreprise && <small className="d-block">{p.annonceur_entreprise}</small>}
                      <small className="aps-text-muted d-block">{p.annonceur_telephone}</small>
                    </td>
                    <td>
                      {p.emplacement_publicitaire?.libelle}
                      <small className="d-block aps-text-muted">{position(p.rang)} · {p.pays?.nom}</small>
                    </td>
                    <td>{jour(p.date_debut)} → {dernierJour(p.date_fin)}</td>
                    <td>{montantDevise(p.montant ?? 0, p.devise)}</td>
                    <td>
                      <small>{p.statistiques.impressions} vues · {p.statistiques.clics} clics</small>
                      {p.en_diffusion && <span className="aps-badge is-success d-block mt-1">En diffusion</span>}
                    </td>
                    <td className="text-end text-nowrap">
                      <button className="btn btn-sm btn-outline-primary" onClick={() => ouvrirDetail(p)}>
                        {p.statut === 'en_moderation' ? 'Examiner' : 'Détail'}
                      </button>
                      <button className="btn btn-sm btn-light ms-1" title="Modifier" aria-label={`Modifier ${p.titre}`}
                        onClick={() => ouvrirDetail(p, 'modifier')}>
                        <i className="fa-solid fa-pen"></i>
                      </button>
                      {!(p.statut === 'annulee' && aHistoriquePaiement(p)) && (
                        <button className="btn btn-sm btn-outline-danger ms-1" title="Supprimer" aria-label={`Supprimer ${p.titre}`}
                          onClick={() => supprimer(p)}>
                          <i className="fa-solid fa-trash"></i>
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <FondsModal
        titre={detail ? `Publicité « ${detail.titre} »` : ''}
        ouvert={!!detail}
        occupe={occupe}
        onFermer={() => setDetail(null)}
        pied={detail && (
          decision === 'modifier' ? (
            <>
              <button className="btn btn-light" onClick={() => setDecision(null)} disabled={occupe}>Annuler</button>
              <button className="btn btn-primary" onClick={enregistrer} disabled={occupe || !formulaire.titre?.trim()}>
                {occupe && <span className="spinner-border spinner-border-sm me-2" />}
                Enregistrer
              </button>
            </>
          ) : decision ? (
            <>
              <button className="btn btn-light" onClick={() => setDecision(null)} disabled={occupe}>Retour</button>
              <button
                className={`btn ${decision === 'accepter' ? 'btn-success' : 'btn-danger'}`}
                onClick={decider}
                disabled={occupe || (decision === 'rejeter' && !motif.trim()) || (decision === 'accepter' && !dateDebut)}
              >
                {occupe && <span className="spinner-border spinner-border-sm me-2" />}
                {decision === 'accepter' ? 'Confirmer l’acceptation' : 'Confirmer le rejet'}
              </button>
            </>
          ) : (
            <>
              {!(detail.statut === 'annulee' && aHistoriquePaiement(detail)) && (
                <button className="btn btn-outline-danger" onClick={() => supprimer(detail)}>
                  <i className="fa-solid fa-trash me-1"></i>{aHistoriquePaiement(detail) ? 'Retirer' : 'Supprimer'}
                </button>
              )}
              <button className="btn btn-light me-auto" onClick={() => setDecision('modifier')}>
                <i className="fa-solid fa-pen me-1"></i>Modifier
              </button>
              {['en_moderation', 'en_attente_paiement'].includes(detail.statut) && (
                <button className="btn btn-outline-danger" onClick={() => setDecision('rejeter')}>Rejeter</button>
              )}
              {['en_moderation', 'expiree'].includes(detail.statut) && (
                <button className="btn btn-success" onClick={() => setDecision('accepter')}>
                  {detail.statut === 'expiree' ? 'Relancer (accepter à nouveau)' : 'Accepter'}
                </button>
              )}
            </>
          )
        )}
      >
        {detail && (
          <>
            {erreurDecision && <div className="alert alert-danger">{erreurDecision}</div>}

            {decision === 'accepter' && (
              <div className="mb-3">
                <label className="form-label" htmlFor="pub-date-debut">Début de diffusion</label>
                <input id="pub-date-debut" type="date" className="form-control" min={aujourdhuiIso()}
                  value={dateDebut} onChange={(e) => setDateDebut(e.target.value)} disabled={occupe} />
                <small className="aps-text-muted">
                  Date demandée : {jour(detail.date_debut)}. La place est bloquée pendant le délai de paiement ;
                  l'annonceur reçoit le lien de paiement par {CANAUX[detail.canal_notification] ?? 'WhatsApp'}.
                </small>
              </div>
            )}
            {decision === 'modifier' && (
              <div className="row g-2">
                {CHAMPS_EDITION.map(({ cle, libelle, type, max, requis }) => (
                  <div key={cle} className={type === 'textarea' ? 'col-12' : 'col-md-6'}>
                    <label className="form-label small mb-1" htmlFor={`pub-${cle}`}>{libelle}{requis && ' *'}</label>
                    {type === 'textarea' ? (
                      <textarea id={`pub-${cle}`} className="form-control" rows={3} value={formulaire[cle]}
                        onChange={(e) => setFormulaire((f) => ({ ...f, [cle]: e.target.value }))} disabled={occupe} />
                    ) : type === 'canal' ? (
                      <select id={`pub-${cle}`} className="form-select" value={formulaire[cle] || 'whatsapp'}
                        onChange={(e) => setFormulaire((f) => ({ ...f, [cle]: e.target.value }))} disabled={occupe}>
                        {Object.entries(CANAUX).map(([code, libelle]) => <option key={code} value={code}>{libelle}</option>)}
                      </select>
                    ) : (
                      <input id={`pub-${cle}`} type={type ?? 'text'} className="form-control" maxLength={max} value={formulaire[cle]}
                        onChange={(e) => setFormulaire((f) => ({ ...f, [cle]: e.target.value }))} disabled={occupe} />
                    )}
                  </div>
                ))}
                <div className="col-12">
                  <label className="form-label small mb-1" htmlFor="pub-visuel">Remplacer le visuel (JPEG, PNG, WEBP)</label>
                  <input id="pub-visuel" type="file" className="form-control" accept="image/jpeg,image/png,image/webp"
                    onChange={(e) => setVisuel(e.target.files?.[0] ?? null)} disabled={occupe} />
                </div>
              </div>
            )}
            {decision === 'rejeter' && (
              <div className="mb-3">
                <label className="form-label" htmlFor="pub-motif">
                  Motif du rejet (envoyé par {CANAUX[detail.canal_notification] ?? 'WhatsApp'})
                </label>
                <textarea id="pub-motif" className="form-control" rows={3} maxLength={500} value={motif}
                  onChange={(e) => setMotif(e.target.value)} disabled={occupe}
                  placeholder="Ex. Le visuel contient une allégation de santé non autorisée." />
              </div>
            )}

            {!decision && (
              <>
                <img src={detail.visuel_url} alt={detail.titre} className="w-100 mb-3" style={{ maxHeight: 260, objectFit: 'contain', borderRadius: 8, background: '#f4f6f9' }} />
                <div className="mb-2"><span className={`aps-badge ${s?.badge}`}>{s?.libelle}</span></div>
                <p className="mb-2">{detail.description}</p>
                <dl className="row small mb-2">
                  <dt className="col-5">Contact affiché</dt>
                  <dd className="col-7">{detail.telephone_contact}{detail.email_contact && <><br />{detail.email_contact}</>}</dd>
                  {detail.localisation && (<><dt className="col-5">Localisation</dt><dd className="col-7">{detail.localisation}</dd></>)}
                  <dt className="col-5">Annonceur</dt>
                  <dd className="col-7">
                    {detail.annonceur_nom}{detail.annonceur_entreprise && ` — ${detail.annonceur_entreprise}`}<br />
                    Tél. : {detail.annonceur_telephone}{detail.annonceur_email && <><br />{detail.annonceur_email}</>}
                  </dd>
                  <dt className="col-5">Notifié par</dt>
                  <dd className="col-7">
                    <span className="aps-badge is-neutral">{CANAUX[detail.canal_notification] ?? 'WhatsApp'}</span>
                  </dd>
                  <dt className="col-5">Emplacement</dt>
                  <dd className="col-7">{detail.emplacement_publicitaire?.libelle} · {position(detail.rang)} · {detail.pays?.nom}</dd>
                  <dt className="col-5">Période</dt>
                  <dd className="col-7">{jour(detail.date_debut)} → {dernierJour(detail.date_fin)}</dd>
                  <dt className="col-5">Montant</dt>
                  <dd className="col-7">{montantDevise(detail.montant ?? 0, detail.devise)}</dd>
                  {detail.date_limite_paiement && (<><dt className="col-5">À payer avant</dt><dd className="col-7">{dateHeure(detail.date_limite_paiement)}</dd></>)}
                  {detail.motif_rejet && (<><dt className="col-5">Motif du rejet</dt><dd className="col-7">{detail.motif_rejet}</dd></>)}
                  {detail.facture && (<><dt className="col-5">Facture</dt><dd className="col-7">{detail.facture.numero}</dd></>)}
                </dl>
                {facture && (
                  <div className="small border rounded p-2 mb-2">
                    {facture.lignes.map((l) => (
                      <div key={l.code} className="d-flex justify-content-between"><span>{l.libelle}</span><span>{montantDevise(l.montant, facture.devise)}</span></div>
                    ))}
                    <div className="d-flex justify-content-between fw-semibold border-top mt-1 pt-1">
                      <span>Total payé</span><span>{montantDevise(facture.total, facture.devise)}</span>
                    </div>
                  </div>
                )}
                {stats && (
                  <div className="small aps-text-muted">
                    {stats.impressions} affichages · {stats.clics} clics · taux de clic {stats.taux_clic} %
                  </div>
                )}
              </>
            )}
          </>
        )}
      </FondsModal>
    </main>
  );
}
