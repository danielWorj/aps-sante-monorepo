// medecin-paiements.jsx — portail médecin, « Moyens de paiement ».
//
// Où ApSa verse les honoraires du médecin :
//  - Mobile Money : plusieurs numéros possibles (opérateur, numéro, nom du
//    compte), UN SEUL actif à la fois — c'est lui qui reçoit les retraits.
//    Activer un numéro désactive les autres (règle appliquée par le serveur).
//  - Carte bancaire : via Stripe Connect. La carte (ou le compte) est saisie
//    sur la page sécurisée de Stripe, jamais sur ApSa (PCI-DSS) ; on n'affiche
//    qu'un résumé (marque, 4 derniers chiffres, statut).
// Les écritures exigent un code PIN récent : apiClient ouvre GardePin seul.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import PortailSidebar from '../layouts/portail-sidebar';
import { useConfirmation, useToast } from '../../feedback';
import { obtenirMonProfil } from '../../../services/medecinService';
import {
  creerMobileMoney,
  definirMobileMoneyActif,
  dissocierCompteStripe,
  lienInscriptionStripe,
  lienTableauDeBordStripe,
  listerMobileMoneyMedecin,
  listerTypesMobileMoney,
  modifierMobileMoney,
  obtenirCompteStripe,
  supprimerMobileMoney,
} from '../../../services/moyenPaiementService';
import '../../../assets/styles/moyens-paiement.css';

const FORMULAIRE_VIDE = { id: '', type_mobile_money_id: '', numero: '', titulaire: '', actif: false };

/** État lisible du compte Stripe Connect. */
function statutStripe(compte) {
  if (!compte) return null;
  if (compte.virements_actives) return { cle: 'actif', libelle: 'Actif', classe: 'chip-verifie', icone: 'fa-circle-check' };
  if (compte.details_soumis) {
    return { cle: 'verification', libelle: 'Vérification en cours', classe: 'chip-st-attente', icone: 'fa-hourglass-half' };
  }
  return { cle: 'incomplet', libelle: 'Inscription à terminer', classe: 'chip-st-attente', icone: 'fa-triangle-exclamation' };
}

function libelleExterne(compte) {
  if (!compte?.derniers_chiffres) return null;
  const nature = compte.type_externe === 'card' ? 'Carte' : 'Compte';
  const marque = compte.marque_externe ? ` ${compte.marque_externe.toUpperCase()}` : '';
  return `${nature}${marque} •••• ${compte.derniers_chiffres}${compte.devise ? ` · ${compte.devise}` : ''}`;
}

export default function MedecinPaiements() {
  const toast = useToast();
  const confirmer = useConfirmation();
  const [params, setParams] = useSearchParams();

  const [medecin, setMedecin] = useState(null);
  const [erreur, setErreur] = useState(null);

  const [operateurs, setOperateurs] = useState([]);
  const [numeros, setNumeros] = useState([]);
  const [formulaire, setFormulaire] = useState(null); // null = fermé
  const [erreurFormulaire, setErreurFormulaire] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [bascule, setBascule] = useState(null); // id du numéro en cours d'activation

  const [compteStripe, setCompteStripe] = useState(undefined); // undefined = chargement
  const [erreurStripe, setErreurStripe] = useState('');
  const [redirection, setRedirection] = useState(false);

  const chargerNumeros = useCallback(async (medecinId) => {
    setNumeros((await listerMobileMoneyMedecin(medecinId)) || []);
  }, []);

  const chargerStripe = useCallback(
    (medecinId) =>
      obtenirCompteStripe(medecinId)
        .then((compte) => { setErreurStripe(''); setCompteStripe(compte ?? null); })
        .catch((err) => { setCompteStripe(null); setErreurStripe(err?.message || 'État Stripe indisponible.'); }),
    []
  );

  const charger = useCallback(
    () =>
      obtenirMonProfil()
        .then(async ({ medecin: m }) => {
          setErreur(null);
          setMedecin(m);
          const [ops] = await Promise.all([
            listerTypesMobileMoney(m.pays_exercice_id ? { pays_id: m.pays_exercice_id } : {}),
            chargerNumeros(m.medecin_id),
            chargerStripe(m.medecin_id),
          ]);
          // Aucun opérateur déclaré pour le pays d'exercice : on propose tous les opérateurs.
          setOperateurs(ops?.length ? ops : (await listerTypesMobileMoney()) || []);
        })
        .catch((err) =>
          setErreur(err?.status === 404 ? "Aucune fiche médecin n'est associée à ce compte." : err?.message || 'Chargement impossible.')
        ),
    [chargerNumeros, chargerStripe]
  );

  useEffect(() => { charger(); }, [charger]);

  // ─── Mobile Money ────────────────────────────────────────────────
  const numeroActif = useMemo(() => numeros.find((n) => n.actif) || null, [numeros]);

  function ouvrirAjout() {
    setErreurFormulaire('');
    setFormulaire({ ...FORMULAIRE_VIDE, type_mobile_money_id: operateurs[0]?.id || '', actif: numeros.length === 0 });
  }

  function ouvrirEdition(n) {
    setErreurFormulaire('');
    setFormulaire({ id: n.id, type_mobile_money_id: n.type_mobile_money_id, numero: n.numero, titulaire: n.titulaire, actif: n.actif });
  }

  async function enregistrer(e) {
    e.preventDefault();
    if (envoi) return;
    const numero = formulaire.numero.trim();
    const titulaire = formulaire.titulaire.trim();
    if (!formulaire.type_mobile_money_id) return setErreurFormulaire("Choisissez l'opérateur.");
    if (!/^\+?[\d\s.-]{8,20}$/.test(numero)) return setErreurFormulaire('Numéro de téléphone invalide.');
    if (!titulaire) return setErreurFormulaire('Indiquez le nom du compte (titulaire).');

    setEnvoi(true);
    setErreurFormulaire('');
    try {
      const donnees = { type_mobile_money_id: formulaire.type_mobile_money_id, numero, titulaire };
      const enregistre = formulaire.id
        ? await modifierMobileMoney(formulaire.id, donnees)
        : await creerMobileMoney({ ...donnees, medecin_id: medecin.medecin_id });
      if (formulaire.actif && !enregistre.actif) {
        await definirMobileMoneyActif(enregistre.id, true);
      }
      toast.succes(formulaire.id ? 'Numéro mis à jour.' : 'Numéro ajouté.');
      setFormulaire(null);
      await chargerNumeros(medecin.medecin_id);
    } catch (err) {
      setErreurFormulaire(err?.message || 'Enregistrement impossible.');
    } finally {
      setEnvoi(false);
    }
  }

  async function basculerActif(n) {
    if (bascule) return;
    const activer = !n.actif;
    if (!activer && !(await confirmer({
      titre: 'Désactiver ce numéro ?',
      message: 'Sans numéro actif, vous ne pourrez plus retirer vos honoraires par Mobile Money.',
      labelConfirmer: 'Désactiver',
      variante: 'avertissement',
    }))) return;

    setBascule(n.id);
    try {
      const reponse = await definirMobileMoneyActif(n.id, activer);
      setNumeros(reponse.mobileMoneys || []);
      toast.succes(reponse.message);
    } catch (err) {
      toast.erreur(err?.message || 'Modification impossible.');
    } finally {
      setBascule(null);
    }
  }

  async function supprimer(n) {
    if (!(await confirmer({
      titre: 'Supprimer ce numéro ?',
      message: `${n.numero} (${n.titulaire}) sera retiré de vos moyens de paiement.`,
      labelConfirmer: 'Supprimer',
      variante: 'danger',
    }))) return;
    try {
      const reponse = await supprimerMobileMoney(n.id);
      toast.succes(reponse?.message || 'Numéro supprimé.');
      await chargerNumeros(medecin.medecin_id);
    } catch (err) {
      toast.erreur(err?.message || 'Suppression impossible.');
    }
  }

  // ─── Stripe ──────────────────────────────────────────────────────
  const allerVersStripe = useCallback(async (obtenirUrl) => {
    setRedirection(true);
    setErreurStripe('');
    try {
      window.location.assign(await obtenirUrl());
    } catch (err) {
      setErreurStripe(err?.message || 'Stripe est momentanément indisponible.');
      setRedirection(false);
    }
  }, []);

  // Retour depuis Stripe : ?stripe=retour (resynchronisation) ou ?stripe=relancer
  // (lien expiré : on en redemande un et on y retourne).
  const retourStripe = params.get('stripe');
  useEffect(() => {
    if (!medecin || !retourStripe) return;
    setParams({}, { replace: true });
    if (retourStripe === 'relancer') {
      lienInscriptionStripe(medecin.medecin_id)
        .then((url) => window.location.assign(url))
        .catch((err) => setErreurStripe(err?.message || 'Stripe est momentanément indisponible.'));
    } else {
      toast.info('Informations Stripe mises à jour.');
      chargerStripe(medecin.medecin_id);
    }
  }, [medecin, retourStripe, setParams, chargerStripe, toast]);

  async function dissocier() {
    if (!(await confirmer({
      titre: 'Dissocier votre compte Stripe ?',
      message: 'Vous ne recevrez plus de paiements par carte bancaire tant que vous n’aurez pas associé un nouveau compte.',
      labelConfirmer: 'Dissocier',
      variante: 'danger',
    }))) return;
    try {
      await dissocierCompteStripe(medecin.medecin_id);
      toast.succes('Compte Stripe dissocié.');
      setCompteStripe(null);
    } catch (err) {
      toast.erreur(err?.message || 'Opération impossible.');
    }
  }

  const statut = statutStripe(compteStripe);

  return (
    <div className="container-aps">
      <div className="portail-shell">
        <main className="portail-main moyens-paiement">
          <header className="portail-head">
            <div>
              <span className="eyebrow">Espace médecin</span>
              <h1>Moyens de paiement</h1>
              <p>Indiquez où ApSa doit vous verser vos honoraires : Mobile Money ou carte bancaire.</p>
            </div>
            <Link to="/portail/medecin-profil" className="btn btn-outline-primary btn-sm-aps">
              <i className="fa-solid fa-wallet" /> Mon portefeuille
            </Link>
          </header>

          {erreur && (
            <div className="alert alert-danger d-flex align-items-center" role="alert">
              <i className="fa-solid fa-circle-exclamation me-2" />
              <div className="flex-grow-1">{erreur}</div>
              <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => { setErreur(null); charger(); }}>
                Réessayer
              </button>
            </div>
          )}
          {!medecin && !erreur && (
            <div className="text-center py-5"><div className="spinner-border text-primary" role="status" /></div>
          )}

          {medecin && (
            <>
              {/* ─────────────── Mobile Money ─────────────── */}
              <section className="info-card mp-section">
                <div className="mp-section-tete">
                  <div>
                    <h3><i className="fa-solid fa-mobile-screen-button" /> Mobile Money</h3>
                    <p className="mp-aide">
                      Un seul numéro est actif à la fois : c&apos;est lui qui reçoit vos retraits. Activer un numéro
                      désactive automatiquement les autres.
                    </p>
                  </div>
                  {!formulaire && (
                    <button type="button" className="btn btn-primary btn-sm-aps" onClick={ouvrirAjout} disabled={operateurs.length === 0}>
                      <i className="fa-solid fa-plus" /> Ajouter un numéro
                    </button>
                  )}
                </div>

                {operateurs.length === 0 && (
                  <div className="note-box mb-3">
                    <i className="fa-solid fa-circle-info" />
                    <span>Aucun opérateur Mobile Money n&apos;est encore configuré. Contactez l&apos;administration ApSa.</span>
                  </div>
                )}

                {formulaire && (
                  <form className="mp-formulaire" onSubmit={enregistrer} noValidate>
                    <h4>{formulaire.id ? 'Modifier le numéro' : 'Nouveau numéro Mobile Money'}</h4>
                    <div className="row g-3">
                      <div className="col-md-4">
                        <label className="form-label-aps" htmlFor="mp-operateur">Opérateur</label>
                        <select
                          id="mp-operateur"
                          className="form-select"
                          value={formulaire.type_mobile_money_id}
                          onChange={(e) => setFormulaire((f) => ({ ...f, type_mobile_money_id: e.target.value }))}
                        >
                          <option value="">Choisir…</option>
                          {operateurs.map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.libelle}{o.pays?.nom ? ` — ${o.pays.nom}` : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="col-md-4">
                        <label className="form-label-aps" htmlFor="mp-numero">Numéro de téléphone</label>
                        <input
                          id="mp-numero"
                          type="tel"
                          inputMode="tel"
                          autoComplete="tel"
                          className="form-control"
                          placeholder="ex. 6 99 12 34 56"
                          value={formulaire.numero}
                          onChange={(e) => setFormulaire((f) => ({ ...f, numero: e.target.value }))}
                        />
                      </div>
                      <div className="col-md-4">
                        <label className="form-label-aps" htmlFor="mp-titulaire">Nom du compte</label>
                        <input
                          id="mp-titulaire"
                          type="text"
                          autoComplete="name"
                          className="form-control"
                          placeholder="Tel qu'enregistré chez l'opérateur"
                          value={formulaire.titulaire}
                          onChange={(e) => setFormulaire((f) => ({ ...f, titulaire: e.target.value }))}
                        />
                      </div>
                    </div>
                    {!(formulaire.id && numeros.find((n) => n.id === formulaire.id)?.actif) && (
                      <div className="form-check form-switch mt-3">
                        <input
                          id="mp-actif"
                          className="form-check-input"
                          type="checkbox"
                          role="switch"
                          checked={formulaire.actif}
                          onChange={(e) => setFormulaire((f) => ({ ...f, actif: e.target.checked }))}
                        />
                        <label className="form-check-label" htmlFor="mp-actif">
                          En faire mon numéro actif
                        </label>
                      </div>
                    )}
                    {erreurFormulaire && <p className="text-danger small mt-2 mb-0">{erreurFormulaire}</p>}
                    <div className="mp-formulaire-actions">
                      <button type="button" className="btn btn-ghost" onClick={() => setFormulaire(null)} disabled={envoi}>
                        Annuler
                      </button>
                      <button type="submit" className="btn btn-primary" disabled={envoi}>
                        {envoi ? 'Enregistrement…' : 'Enregistrer'}
                      </button>
                    </div>
                  </form>
                )}

                {numeros.length === 0 && !formulaire ? (
                  <div className="mp-vide">
                    <i className="fa-solid fa-mobile-screen-button" />
                    <p>Aucun numéro enregistré. Ajoutez votre numéro Mobile Money pour pouvoir retirer vos honoraires.</p>
                  </div>
                ) : (
                  <ul className="mp-liste">
                    {numeros.map((n) => (
                      <li key={n.id} className={`mp-ligne ${n.actif ? 'is-actif' : ''}`}>
                        <span className="mp-ligne-ic"><i className="fa-solid fa-sim-card" /></span>
                        <div className="mp-ligne-txt">
                          <strong>{n.numero}</strong>
                          <span>{n.titulaire} · {n.type_mobile_money?.libelle || 'Mobile Money'}</span>
                        </div>
                        <span className={`chip ${n.actif ? 'chip-verifie' : 'chip-neutre'}`}>
                          {n.actif ? 'Actif' : 'Inactif'}
                        </span>
                        <div className="form-check form-switch m-0" title={n.actif ? 'Désactiver' : 'Activer'}>
                          <input
                            className="form-check-input"
                            type="checkbox"
                            role="switch"
                            aria-label={`${n.actif ? 'Désactiver' : 'Activer'} le ${n.numero}`}
                            checked={n.actif}
                            disabled={bascule !== null}
                            onChange={() => basculerActif(n)}
                          />
                        </div>
                        <div className="mp-ligne-actions">
                          <button type="button" className="btn btn-ghost btn-sm-aps" onClick={() => ouvrirEdition(n)} aria-label={`Modifier le ${n.numero}`}>
                            <i className="fa-solid fa-pen" />
                          </button>
                          <button type="button" className="btn btn-ghost btn-sm-aps" onClick={() => supprimer(n)} aria-label={`Supprimer le ${n.numero}`}>
                            <i className="fa-solid fa-trash-can" />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}

                {numeros.length > 0 && !numeroActif && (
                  <div className="note-box mt-3">
                    <i className="fa-solid fa-triangle-exclamation" />
                    <span>Aucun numéro actif : activez-en un pour pouvoir retirer vos honoraires.</span>
                  </div>
                )}
              </section>

              {/* ─────────────── Carte bancaire (Stripe) ─────────────── */}
              <section className="info-card mp-section">
                <div className="mp-section-tete">
                  <div>
                    <h3><i className="fa-regular fa-credit-card" /> Carte bancaire</h3>
                    <p className="mp-aide">
                      Recevez vos paiements par carte grâce à Stripe. Vos informations de carte sont saisies sur la page
                      sécurisée de Stripe : ApSa n&apos;y a jamais accès.
                    </p>
                  </div>
                  {statut && (
                    <span className={`chip ${statut.classe}`}>
                      <i className={`fa-solid ${statut.icone}`} /> {statut.libelle}
                    </span>
                  )}
                </div>

                {compteStripe === undefined && (
                  <div className="text-center py-3"><div className="spinner-border spinner-border-sm text-primary" role="status" /></div>
                )}

                {compteStripe === null && (
                  <div className="mp-stripe-vide">
                    <ol className="mp-etapes">
                      <li>Cliquez sur « Ajouter ma carte bancaire » : vous êtes redirigé vers Stripe.</li>
                      <li>Renseignez votre identité et la carte (ou le compte) qui recevra vos paiements.</li>
                      <li>De retour sur ApSa, votre moyen de paiement apparaît ici une fois validé par Stripe.</li>
                    </ol>
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={redirection}
                      onClick={() => allerVersStripe(() => lienInscriptionStripe(medecin.medecin_id))}
                    >
                      <i className="fa-regular fa-credit-card" /> {redirection ? 'Redirection vers Stripe…' : 'Ajouter ma carte bancaire'}
                    </button>
                  </div>
                )}

                {compteStripe && (
                  <div className="mp-stripe">
                    <div className="mp-ligne is-carte">
                      <span className="mp-ligne-ic"><i className="fa-brands fa-stripe-s" /></span>
                      <div className="mp-ligne-txt">
                        <strong>{libelleExterne(compteStripe) || 'Aucune carte enregistrée pour le moment'}</strong>
                        <span>
                          {statut.cle === 'actif' && 'Les paiements par carte vous sont versés sur ce moyen.'}
                          {statut.cle === 'verification' &&
                            `Stripe vérifie vos informations${compteStripe.exigences_en_attente ? ` (${compteStripe.exigences_en_attente} élément(s) à fournir)` : ''}.`}
                          {statut.cle === 'incomplet' && "Votre inscription chez Stripe n'est pas terminée."}
                        </span>
                      </div>
                    </div>
                    <div className="mp-formulaire-actions">
                      {statut.cle === 'actif' ? (
                        <button
                          type="button"
                          className="btn btn-outline-primary btn-sm-aps"
                          disabled={redirection}
                          onClick={() => allerVersStripe(() => lienTableauDeBordStripe(medecin.medecin_id))}
                        >
                          <i className="fa-solid fa-pen" /> Modifier ma carte sur Stripe
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-primary btn-sm-aps"
                          disabled={redirection}
                          onClick={() => allerVersStripe(() => lienInscriptionStripe(medecin.medecin_id))}
                        >
                          <i className="fa-solid fa-arrow-up-right-from-square" />{' '}
                          {statut.cle === 'incomplet' ? "Terminer l'inscription" : 'Compléter mes informations'}
                        </button>
                      )}
                      <button type="button" className="btn btn-ghost btn-sm-aps" onClick={() => chargerStripe(medecin.medecin_id)}>
                        <i className="fa-solid fa-rotate" /> Actualiser
                      </button>
                      <button type="button" className="btn btn-ghost btn-sm-aps text-danger" onClick={dissocier}>
                        <i className="fa-solid fa-link-slash" /> Dissocier
                      </button>
                    </div>
                  </div>
                )}

                {erreurStripe && <p className="text-danger small mt-2 mb-0">{erreurStripe}</p>}
              </section>
            </>
          )}
        </main>
        <PortailSidebar />
      </div>
    </div>
  );
}
