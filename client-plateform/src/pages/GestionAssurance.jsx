// GestionAssurance.jsx — espace gestionnaire d'une fiche assurance
// (guide abonnements assurances v3, §2.2.1). Route /assurances/:id/gestion,
// protégée par RequireAuth ; le serveur n'autorise que l'agent de la fiche
// ou un administrateur (GET /services-assurance/:id/gestion).
//
// Les contenus (activités, agences) sont lus dans la réponse /gestion,
// JAMAIS dans les GET publics (qui renvoient [] hors droits) : la donnée
// est toujours conservée et réapparaît au public dès la réactivation.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useParams } from 'react-router-dom';
import {
  obtenirGestionServiceAssurance,
  obtenirFactureAbonnement,
} from '../services/abonnementAssuranceService';
import {
  creerAgence,
  supprimerAgence,
  creerActivite,
  supprimerActivite,
} from '../services/assuranceService';
import SouscriptionAssurance from '../components/assurances/SouscriptionAssurance';
import ChoixMoyenPaiement from '../components/paiement/ChoixMoyenPaiement';
import PaiementMobileMoney from '../components/paiement/PaiementMobileMoney';
import { FactureChargee } from '../components/paiement/FactureRecapitulative';
import { adaptateurAbonnement } from '../components/paiement/adaptateurs';
import { montantDevise } from '../utils/fonds';

const LIBELLE_STATUT = {
  actif: 'Actif',
  expire: 'Expiré',
  annule: 'Annulé',
  suspendu: 'Suspendu',
  remplace: 'Remplacé (montée de niveau)',
};

const LIBELLE_ORIGINE = {
  self_service: 'En ligne',
  admin: 'Administration',
  virement: 'Virement',
  geste: 'Geste commercial',
  gratuite: 'Offre de lancement',
};

const formatDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—';

/** date_fin est exclusive : dernier jour couvert = veille. */
function dernierJour(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString();
}

/** Fin de la grâce = date_fin + grace_jours ; le serveur ne l'expose pas : on affiche la date d'échéance. */
function BandeauGrace({ abonnement }) {
  if (!abonnement.en_grace) return null;
  return (
    <div className="banner-institutionnel mb-3">
      <i className="fa-solid fa-triangle-exclamation" />
      <span>
        Votre abonnement a expiré le {formatDate(dernierJour(abonnement.date_fin))} : vos contenus enrichis
        sont masqués au public. Renouvelez-le pour qu&apos;ils réapparaissent, sans ressaisie.
      </span>
    </div>
  );
}

function ModaleFacture({ abonnementId, onFermer }) {
  return createPortal(
    <div className="rdv-modal-overlay" onClick={onFermer}>
      <div className="rdv-modal" role="dialog" aria-modal="true" aria-label="Facture" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="rdv-modal-close" onClick={onFermer} aria-label="Fermer">
          <i className="fa-solid fa-xmark" />
        </button>
        <FactureChargee cle={`facture-abonnement:${abonnementId}`} charger={() => obtenirFactureAbonnement(abonnementId)} />
      </div>
    </div>,
    document.body
  );
}

function MonAbonnement({ donnees, onSouscrire, onReprendre }) {
  const { abonnement, brouillon, historique } = donnees;
  const [factureOuverte, setFactureOuverte] = useState(null);

  return (
    <div className="info-card">
      <h3><i className="fa-solid fa-id-card" /> Mon abonnement</h3>
      {abonnement.statut_abonnement === 'actif' ? (
        <table className="hours-table" style={{ width: '100%' }}>
          <tbody>
            <tr><td>Niveau</td><td><strong>{abonnement.niveau?.libelle}</strong></td></tr>
            <tr><td>Valable jusqu&apos;au</td><td>{formatDate(dernierJour(abonnement.date_fin))} inclus</td></tr>
            <tr><td>Jours restants</td><td>{abonnement.jours_restants}</td></tr>
          </tbody>
        </table>
      ) : (
        <p style={{ fontSize: '.9rem' }}>
          {abonnement.statut_abonnement === 'grace'
            ? 'Abonnement expiré (période de grâce).'
            : 'Aucun abonnement actif : votre fiche est en présence minimale (dénomination, type et localisation).'}
        </p>
      )}

      {brouillon && (
        <div className="minimal-note mt-2">
          <i className="fa-solid fa-hourglass-half" /> Abonnement « {brouillon.niveau.libelle} » ({brouillon.duree_mois} mois,{' '}
          {montantDevise(brouillon.montant_total, brouillon.devise)}) en attente de paiement.{' '}
          <button type="button" className="btn btn-link btn-sm p-0 align-baseline" onClick={() => onReprendre(brouillon.abonnement_id)}>
            Reprendre le paiement
          </button>
        </div>
      )}

      <div className="d-flex gap-2 flex-wrap mt-3">
        <button type="button" className="btn btn-primary btn-sm-aps" onClick={onSouscrire}>
          <i className="fa-solid fa-arrows-rotate" />{' '}
          {abonnement.statut_abonnement === 'actif' ? 'Renouveler ou passer au niveau supérieur' : 'Souscrire un abonnement'}
        </button>
      </div>

      {historique.length > 0 && (
        <>
          <h4 className="mt-4" style={{ fontSize: '.95rem' }}>Historique</h4>
          <div className="table-responsive">
            <table className="hours-table" style={{ width: '100%', fontSize: '.85rem' }}>
              <thead>
                <tr><th>Niveau</th><th>Période</th><th>Montant</th><th>Statut</th><th>Origine</th><th>Facture</th></tr>
              </thead>
              <tbody>
                {historique.map((h) => (
                  <tr key={h.abonnement_id}>
                    <td>{h.niveau?.libelle}</td>
                    <td>{h.date_debut ? `${formatDate(h.date_debut)} → ${formatDate(dernierJour(h.date_fin))}` : '—'}</td>
                    <td>{montantDevise(h.montant_total, h.devise)}</td>
                    <td>{LIBELLE_STATUT[h.statut] ?? h.statut}</td>
                    <td>{LIBELLE_ORIGINE[h.origine] ?? h.origine}</td>
                    <td>
                      {h.facture ? (
                        <button type="button" className="btn btn-link btn-sm p-0" onClick={() => setFactureOuverte(h.abonnement_id)}>
                          {h.facture.numero}
                        </button>
                      ) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {factureOuverte && <ModaleFacture abonnementId={factureOuverte} onFermer={() => setFactureOuverte(null)} />}
    </div>
  );
}

function Agences({ serviceId, agences, quota, visiblesAuPublic, onChange }) {
  const [form, setForm] = useState({ libelle: '', localisation: '', contact: '' });
  const [erreur, setErreur] = useState(null);
  const [envoi, setEnvoi] = useState(false);
  const plafond = quota.max !== null && quota.utilise >= quota.max;

  const ajouter = async (e) => {
    e.preventDefault();
    setErreur(null);
    setEnvoi(true);
    try {
      await creerAgence({ service_assurance_id: serviceId, ...form });
      setForm({ libelle: '', localisation: '', contact: '' });
      onChange();
    } catch (err) {
      setErreur(err?.message || "Impossible d'ajouter l'agence.");
    } finally {
      setEnvoi(false);
    }
  };

  const retirer = async (id) => {
    if (!window.confirm('Supprimer cette agence ?')) return;
    try {
      await supprimerAgence(id);
      onChange();
    } catch (err) {
      setErreur(err?.message || 'Suppression impossible.');
    }
  };

  return (
    <div className="info-card">
      <h3>
        <i className="fa-solid fa-shop" /> Agences{' '}
        <small className="text-faint">
          ({quota.utilise} / {quota.max === null ? 'illimité' : quota.max})
        </small>
      </h3>
      {!visiblesAuPublic && agences.length > 0 && (
        <p className="minimal-note">
          <i className="fa-solid fa-eye-slash" /> Vos agences sont conservées mais ne sont pas visibles du public avec votre abonnement actuel.
        </p>
      )}
      <ul className="list-unstyled mb-3">
        {agences.map((a) => (
          <li key={a.agence_id} className="d-flex justify-content-between align-items-center py-1" style={{ fontSize: '.9rem' }}>
            <span><strong>{a.libelle}</strong> — {a.localisation} · {a.contact}</span>
            <button type="button" className="btn btn-ghost btn-sm-aps" onClick={() => retirer(a.agence_id)} aria-label="Supprimer">
              <i className="fa-solid fa-trash" />
            </button>
          </li>
        ))}
        {!agences.length && <li className="minimal-note">Aucune agence.</li>}
      </ul>
      {plafond ? (
        <p className="minimal-note mb-0">
          <i className="fa-solid fa-circle-info" />{' '}
          {quota.max === 0
            ? 'Souscrivez un abonnement incluant les agences pour en ajouter.'
            : "Vous avez atteint le nombre maximal d'agences de votre niveau."}
        </p>
      ) : (
        <form onSubmit={ajouter} className="row g-2">
          <div className="col-md-4"><input className="form-control" placeholder="Libellé" required value={form.libelle} onChange={(e) => setForm({ ...form, libelle: e.target.value })} /></div>
          <div className="col-md-4"><input className="form-control" placeholder="Localisation" required value={form.localisation} onChange={(e) => setForm({ ...form, localisation: e.target.value })} /></div>
          <div className="col-md-3"><input className="form-control" placeholder="Contact" required value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} /></div>
          <div className="col-md-1"><button type="submit" className="btn btn-primary w-100" disabled={envoi} aria-label="Ajouter"><i className="fa-solid fa-plus" /></button></div>
        </form>
      )}
      {erreur && <p className="status-card-error mt-2"><i className="fa-solid fa-circle-exclamation" /> {erreur}</p>}
    </div>
  );
}

function Activites({ serviceId, activites, visiblesAuPublic, onChange }) {
  const [form, setForm] = useState({ titre: '', public_cible: '', description: '' });
  const [erreur, setErreur] = useState(null);
  const [envoi, setEnvoi] = useState(false);

  const ajouter = async (e) => {
    e.preventDefault();
    setErreur(null);
    setEnvoi(true);
    try {
      await creerActivite({ service_assurance_id: serviceId, ...form });
      setForm({ titre: '', public_cible: '', description: '' });
      onChange();
    } catch (err) {
      setErreur(err?.message || "Impossible d'ajouter l'activité.");
    } finally {
      setEnvoi(false);
    }
  };

  const retirer = async (id) => {
    if (!window.confirm('Supprimer cette activité ?')) return;
    try {
      await supprimerActivite(id);
      onChange();
    } catch (err) {
      setErreur(err?.message || 'Suppression impossible.');
    }
  };

  return (
    <div className="info-card">
      <h3><i className="fa-solid fa-file-shield" /> Activités &amp; produits</h3>
      {!visiblesAuPublic && activites.length > 0 && (
        <p className="minimal-note">
          <i className="fa-solid fa-eye-slash" /> Vos activités sont conservées mais ne sont pas visibles du public avec votre abonnement actuel.
        </p>
      )}
      <ul className="list-unstyled mb-3">
        {activites.map((a) => (
          <li key={a.activite_id} className="d-flex justify-content-between align-items-center py-1" style={{ fontSize: '.9rem' }}>
            <span>
              <strong>{a.titre}</strong> — {a.public_cible}
              {a.options?.length ? <small className="text-faint"> · {a.options.length} option(s)</small> : null}
            </span>
            <button type="button" className="btn btn-ghost btn-sm-aps" onClick={() => retirer(a.activite_id)} aria-label="Supprimer">
              <i className="fa-solid fa-trash" />
            </button>
          </li>
        ))}
        {!activites.length && <li className="minimal-note">Aucune activité.</li>}
      </ul>
      <form onSubmit={ajouter} className="row g-2">
        <div className="col-md-4"><input className="form-control" placeholder="Titre" required value={form.titre} onChange={(e) => setForm({ ...form, titre: e.target.value })} /></div>
        <div className="col-md-3"><input className="form-control" placeholder="Public cible" required value={form.public_cible} onChange={(e) => setForm({ ...form, public_cible: e.target.value })} /></div>
        <div className="col-md-4"><input className="form-control" placeholder="Description (facultatif)" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
        <div className="col-md-1"><button type="submit" className="btn btn-primary w-100" disabled={envoi} aria-label="Ajouter"><i className="fa-solid fa-plus" /></button></div>
      </form>
      {erreur && <p className="status-card-error mt-2"><i className="fa-solid fa-circle-exclamation" /> {erreur}</p>}
    </div>
  );
}

export default function GestionAssurance() {
  const { id } = useParams();
  const [donnees, setDonnees] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [souscription, setSouscription] = useState(false);
  const [reprise, setReprise] = useState(null); // { abonnementId, etape: 'choix'|'momo' }

  const charger = useCallback(() => {
    obtenirGestionServiceAssurance(id)
      .then((d) => { setDonnees(d); setErreur(null); })
      .catch((err) => setErreur(err.status === 403
        ? "Cet espace est réservé à l'agent de la fiche ou à un administrateur."
        : err.message || 'Espace indisponible.'));
  }, [id]);

  useEffect(() => { charger(); }, [charger]);

  const adaptateurReprise = useMemo(() => (reprise ? adaptateurAbonnement(reprise.abonnementId) : null), [reprise?.abonnementId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (erreur) {
    return (
      <div className="container-aps" style={{ padding: '3rem 0' }}>
        <p className="status-card-error"><i className="fa-solid fa-circle-exclamation" /> {erreur}</p>
      </div>
    );
  }
  if (!donnees) {
    return <div className="container-aps" style={{ padding: '3rem 0' }}><p className="minimal-note">Chargement de votre espace…</p></div>;
  }

  const { service_assurance: fiche, droits, quotas } = donnees;

  return (
    <section style={{ padding: '2rem 0' }}>
      <div className="container-aps">
        <div className="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-3">
          <div>
            <span className="eyebrow">Espace gestionnaire</span>
            <h1 style={{ fontSize: '1.6rem' }}>{fiche.nom}</h1>
          </div>
          {fiche.statut_verification === 'publie' && (
            <Link to={`/assurances/${id}`} className="btn btn-outline-primary btn-sm-aps">
              <i className="fa-solid fa-eye" /> Voir ma fiche publique
            </Link>
          )}
        </div>

        {fiche.statut_verification !== 'publie' && (
          <div className="banner-institutionnel mb-3">
            <i className="fa-solid fa-hourglass-half" />
            <span>Votre fiche est en cours de vérification : elle n&apos;est pas encore visible du public et ne peut pas être abonnée.</span>
          </div>
        )}
        <BandeauGrace abonnement={donnees.abonnement} />

        <div className="row g-4">
          <div className="col-lg-5">
            <MonAbonnement
              donnees={donnees}
              onSouscrire={() => setSouscription((s) => !s)}
              onReprendre={(abonnementId) => setReprise({ abonnementId, etape: 'choix' })}
            />
          </div>
          <div className="col-lg-7">
            <Agences
              serviceId={id}
              agences={donnees.agences}
              quota={quotas.agences}
              visiblesAuPublic={droits.afficher_agences}
              onChange={charger}
            />
            <Activites
              serviceId={id}
              activites={donnees.activites}
              visiblesAuPublic={droits.afficher_activites}
              onChange={charger}
            />
          </div>
        </div>

        {souscription && (
          <div className="mt-4">
            <h2 style={{ fontSize: '1.3rem' }}>Formules disponibles</h2>
            <SouscriptionAssurance serviceAssuranceId={id} onActive={charger} />
          </div>
        )}
      </div>

      {reprise?.etape === 'choix' && adaptateurReprise && (
        <ChoixMoyenPaiement
          adaptateur={adaptateurReprise}
          onFermer={() => { setReprise(null); charger(); }}
          onChoisirMobileMoney={() => setReprise({ ...reprise, etape: 'momo' })}
        />
      )}
      {reprise?.etape === 'momo' && adaptateurReprise && (
        <PaiementMobileMoney adaptateur={adaptateurReprise} onFermer={() => { setReprise(null); charger(); }} />
      )}
    </section>
  );
}
