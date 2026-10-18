// src/pages/ReserverPublicite.jsx
//
// Réservation d'un espace publicitaire (v9), ouverte depuis la carte
// « Réserver cet espace » d'une page (?page=PAGE_…). Connexion obligatoire.
//
//   1. Position et durée : forfaits de la page, par position dans le slider
//      (la 1re position, affichée en premier, coûte le plus cher).
//   2. Date de début : la position est exclusive ; les périodes déjà prises
//      et la prochaine date libre viennent du serveur.
//   3. La publicité : titre, brève description, flyer / image, contact
//      téléphone, e-mail, localisation.
//   4. L'annonceur : nom, entreprise, WhatsApp (reçoit la décision), e-mail —
//      pré-remplis depuis le compte ou la dernière réservation.
//
// Après validation, la demande part en modération : l'annonceur reçoit par
// WhatsApp le refus motivé, ou l'acceptation avec le lien de paiement.
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  PAGES_PUBLICITE,
  libellePosition,
  listerForfaitsPage,
  obtenirDisponibilites,
  obtenirProfilAnnonceur,
  reserverEspace,
} from '../services/publiciteService';
import { montantDevise } from '../utils/fonds';
import './Publicite.css';

const NOMS_PAGES = {
  [PAGES_PUBLICITE.accueil]: "Page d'accueil",
  [PAGES_PUBLICITE.medecin]: 'Annuaire des médecins',
  [PAGES_PUBLICITE.pharmacie]: 'Annuaire des pharmacies',
  [PAGES_PUBLICITE.structure]: 'Annuaire des centres de santé',
  [PAGES_PUBLICITE.assurances]: 'Annuaire des assurances',
};

const TAILLE_MAX = 5 * 1024 * 1024;
const formatJour = (iso) => (iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' }) : '');
const veille = (iso) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};
const ajouterJours = (iso, n) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const CHAMPS_VIDES = {
  titre: '', description: '', telephone_contact: '', email_contact: '', localisation: '',
  annonceur_nom: '', annonceur_entreprise: '', annonceur_telephone: '', annonceur_email: '',
};

export default function ReserverPublicite() {
  const [params, setParams] = useSearchParams();
  const page = params.get('page') || PAGES_PUBLICITE.accueil;
  const { user } = useAuth();

  const [forfaits, setForfaits] = useState(null);
  const [erreurForfaits, setErreurForfaits] = useState(null);
  const [forfaitId, setForfaitId] = useState('');
  const [dispoChargee, setDispo] = useState(null);
  const [dateDebut, setDateDebut] = useState('');
  const [champs, setChamps] = useState(CHAMPS_VIDES);
  const [visuel, setVisuel] = useState(null);
  const [apercu, setApercu] = useState(null);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState(null);
  const [succes, setSucces] = useState(null);

  // Forfaits de la page (pays du compte).
  useEffect(() => {
    let annule = false;
    listerForfaitsPage(page, user?.pays_id)
      .then((f) => { if (!annule) setForfaits(f); })
      .catch((e) => { if (!annule) { setForfaits([]); setErreurForfaits(e.message); } });
    return () => { annule = true; };
  }, [page, user?.pays_id]);

  // Pré-remplissage de l'annonceur.
  useEffect(() => {
    obtenirProfilAnnonceur()
      .then(({ annonceur }) => setChamps((c) => ({
        ...c,
        annonceur_nom: c.annonceur_nom || annonceur.annonceur_nom || '',
        annonceur_entreprise: c.annonceur_entreprise || annonceur.annonceur_entreprise || '',
        annonceur_telephone: c.annonceur_telephone || annonceur.annonceur_telephone || '',
        annonceur_email: c.annonceur_email || annonceur.annonceur_email || '',
      })))
      .catch(() => {});
  }, []);

  // Disponibilité de la position choisie.
  useEffect(() => {
    if (!forfaitId) return undefined;
    let annule = false;
    obtenirDisponibilites(forfaitId)
      .then((d) => { if (!annule) { setDispo(d); setDateDebut(d.prochaine_date_libre); } })
      .catch(() => { if (!annule) setDispo(null); });
    return () => { annule = true; };
  }, [forfaitId]);

  const parPosition = useMemo(() => {
    const groupes = new Map();
    (forfaits ?? []).forEach((f) => {
      if (!groupes.has(f.rang)) groupes.set(f.rang, []);
      groupes.get(f.rang).push(f);
    });
    return [...groupes.entries()].sort((a, b) => a[0] - b[0]);
  }, [forfaits]);

  const forfait = forfaits?.find((f) => f.forfait_publicitaire_id === forfaitId) ?? null;
  // Disponibilité de la position actuellement choisie seulement.
  const dispo = dispoChargee?.forfait_publicitaire_id === forfaitId ? dispoChargee : null;
  const conflit = useMemo(() => {
    if (!dispo || !dateDebut || !forfait) return null;
    const fin = ajouterJours(dateDebut, forfait.duree_jours);
    return dispo.periodes_occupees.find((p) => p.debut < fin && p.fin_exclue > dateDebut) ?? null;
  }, [dispo, dateDebut, forfait]);

  const majChamp = (k) => (e) => setChamps((c) => ({ ...c, [k]: e.target.value }));

  const choisirVisuel = (fichier) => {
    setErreur(null);
    if (!fichier) return;
    if (!/^image\/(jpeg|png|webp)$/.test(fichier.type)) return setErreur('Le flyer doit être une image JPEG, PNG ou WEBP.');
    if (fichier.size > TAILLE_MAX) return setErreur('Image trop lourde (5 Mo maximum).');
    setVisuel(fichier);
    const lecteur = new FileReader();
    lecteur.onload = (e) => setApercu(e.target.result);
    lecteur.readAsDataURL(fichier);
  };

  const soumettre = async (e) => {
    e.preventDefault();
    setErreur(null);
    if (!forfait) return setErreur('Choisissez une position et une durée.');
    if (!dateDebut) return setErreur('Choisissez la date de début de diffusion.');
    if (conflit) return setErreur('Cette position est déjà réservée sur la période choisie.');
    if (!visuel) return setErreur('Ajoutez le flyer ou l’image de votre publicité.');
    setEnvoi(true);
    try {
      const r = await reserverEspace({ ...champs, forfait_publicitaire_id: forfait.forfait_publicitaire_id, date_debut: dateDebut }, visuel);
      setSucces(r.publicite);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      const libre = err.data?.details?.prochaine_date_libre;
      setErreur(`${err.message}${libre ? ` Prochaine date libre : ${formatJour(libre)}.` : ''}`);
      if (libre) setDateDebut(libre);
    } finally {
      setEnvoi(false);
    }
  };

  if (succes) {
    return (
      <div className="container-aps status-page">
        <div className="status-card is-success">
          <div className="status-card-icon"><i className="fa-solid fa-paper-plane" /></div>
          <span className="status-card-badge">Demande envoyée</span>
          <h1>Merci, votre demande est en cours d’examen</h1>
          <p className="status-card-text">
            Nous vérifions votre publicité « {succes.titre} ». Vous recevrez la décision par WhatsApp au{' '}
            <strong>{succes.annonceur_telephone}</strong> : en cas d’acceptation, le message contient le lien pour
            payer et programmer la diffusion.
          </p>
          <div className="status-card-actions">
            <Link to={`/portail/annonceur/publicites/${succes.publicite_id}`} className="btn btn-primary btn-lg-aps">
              Suivre ma demande
            </Link>
            <Link to="/portail/annonceur" className="btn btn-outline-primary btn-lg-aps">Mes publicités</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <section className="pub-page">
      <div className="container-aps">
        <header className="pub-page-entete">
          <span className="pub-surtitre"><i className="fa-solid fa-bullhorn" /> Espace annonceur</span>
          <h1>Réserver un espace publicitaire</h1>
          <p>
            Votre publicité s’affiche dans le carrousel de la page choisie. Chaque position est exclusive pendant
            votre période : la 1re position apparaît en premier.
          </p>
        </header>

        <form onSubmit={soumettre} className="pub-form" noValidate>
          {/* 1. Page, position et durée */}
          <fieldset className="pub-bloc">
            <legend><span className="pub-etape">1</span> Page, position et durée</legend>
            <label className="form-label-aps" htmlFor="pub-page">Page</label>
            <select id="pub-page" className="form-select mb-3" value={page}
              onChange={(e) => {
                setForfaits(null);
                setForfaitId('');
                setErreurForfaits(null);
                setParams({ page: e.target.value });
              }}>
              {Object.entries(NOMS_PAGES).map(([code, nom]) => <option key={code} value={code}>{nom}</option>)}
            </select>

            {forfaits === null && <p className="form-hint">Chargement des offres…</p>}
            {erreurForfaits && <div className="alert alert-danger">{erreurForfaits}</div>}
            {forfaits?.length === 0 && !erreurForfaits && (
              <p className="form-hint">Aucune offre n’est encore proposée pour cette page dans votre pays.</p>
            )}

            <div className="pub-positions">
              {parPosition.map(([rang, liste]) => (
                <div key={rang} className={`pub-position${rang === 1 ? ' is-premium' : ''}`}>
                  <div className="pub-position-titre">
                    {libellePosition(rang)}
                    {rang === 1 && <span className="pub-position-badge">Affichée en premier</span>}
                  </div>
                  {liste.map((f) => (
                    <label key={f.forfait_publicitaire_id}
                      className={`pub-forfait${forfaitId === f.forfait_publicitaire_id ? ' is-choisi' : ''}`}>
                      <input type="radio" name="forfait" value={f.forfait_publicitaire_id}
                        checked={forfaitId === f.forfait_publicitaire_id}
                        onChange={() => setForfaitId(f.forfait_publicitaire_id)} />
                      <span className="pub-forfait-libelle">{f.libelle} <small>· {f.duree_jours} jours</small></span>
                      <strong>{montantDevise(f.prix, f.devise)}</strong>
                    </label>
                  ))}
                </div>
              ))}
            </div>
          </fieldset>

          {/* 2. Période */}
          {forfait && (
            <fieldset className="pub-bloc">
              <legend><span className="pub-etape">2</span> Période de diffusion</legend>
              <div className="row g-3 align-items-end">
                <div className="col-md-5">
                  <label className="form-label-aps" htmlFor="pub-date">Date de début<span className="required-mark">*</span></label>
                  <input id="pub-date" type="date" className="form-control" value={dateDebut}
                    min={dispo?.premier_jour_reservable} onChange={(e) => setDateDebut(e.target.value)} required />
                </div>
                <div className="col-md-7">
                  {dateDebut && (
                    <p className={`form-hint mb-0${conflit ? ' text-danger' : ''}`}>
                      {conflit
                        ? `Position prise du ${formatJour(conflit.debut)} au ${formatJour(veille(conflit.fin_exclue))}.`
                        : `Diffusion du ${formatJour(dateDebut)} au ${formatJour(veille(ajouterJours(dateDebut, forfait.duree_jours)))} inclus.`}
                    </p>
                  )}
                </div>
              </div>
              {dispo?.periodes_occupees?.length > 0 && (
                <div className="pub-occupe">
                  <small>Périodes déjà réservées pour cette position :</small>
                  <ul>
                    {dispo.periodes_occupees.map((p) => (
                      <li key={p.debut}>{formatJour(p.debut)} → {formatJour(veille(p.fin_exclue))}</li>
                    ))}
                  </ul>
                  <small>Prochaine date libre : <strong>{formatJour(dispo.prochaine_date_libre)}</strong></small>
                </div>
              )}
            </fieldset>
          )}

          {/* 3. La publicité */}
          <fieldset className="pub-bloc">
            <legend><span className="pub-etape">3</span> Votre publicité</legend>
            <div className="row g-3">
              <div className="col-md-7">
                <label className="form-label-aps" htmlFor="pub-titre">Titre<span className="required-mark">*</span></label>
                <input id="pub-titre" className="form-control mb-3" maxLength={150} value={champs.titre} onChange={majChamp('titre')} required />
                <label className="form-label-aps" htmlFor="pub-desc">Brève description<span className="required-mark">*</span></label>
                <textarea id="pub-desc" className="form-control mb-1" rows={4} maxLength={1000} value={champs.description}
                  onChange={majChamp('description')} required />
                <p className="form-hint">{champs.description.length} / 1000</p>
              </div>
              <div className="col-md-5">
                <span className="form-label-aps">Flyer / image<span className="required-mark">*</span></span>
                <label className={`upload-box pub-upload${visuel ? ' has-file' : ''}`}>
                  <input type="file" accept="image/jpeg,image/png,image/webp" className="visually-hidden"
                    onChange={(e) => choisirVisuel(e.target.files?.[0])} />
                  {apercu ? <img src={apercu} alt="Aperçu du flyer" /> : (
                    <span className="upload-default-text">
                      <i className="fa-solid fa-cloud-arrow-up" /> Cliquez pour choisir une image<br />
                      <small>JPEG, PNG ou WEBP — 5 Mo max.</small>
                    </span>
                  )}
                </label>
              </div>
              <div className="col-md-4">
                <label className="form-label-aps" htmlFor="pub-tel">Contact téléphone<span className="required-mark">*</span></label>
                <input id="pub-tel" className="form-control" inputMode="tel" placeholder="+237 6XX XX XX XX"
                  value={champs.telephone_contact} onChange={majChamp('telephone_contact')} required />
              </div>
              <div className="col-md-4">
                <label className="form-label-aps" htmlFor="pub-email">E-mail</label>
                <input id="pub-email" type="email" className="form-control" value={champs.email_contact} onChange={majChamp('email_contact')} />
              </div>
              <div className="col-md-4">
                <label className="form-label-aps" htmlFor="pub-lieu">Localisation</label>
                <input id="pub-lieu" className="form-control" maxLength={255} placeholder="Ex. Akwa, Douala"
                  value={champs.localisation} onChange={majChamp('localisation')} />
              </div>
            </div>
          </fieldset>

          {/* 4. L'annonceur */}
          <fieldset className="pub-bloc">
            <legend><span className="pub-etape">4</span> Vos informations</legend>
            <div className="row g-3">
              <div className="col-md-6">
                <label className="form-label-aps" htmlFor="pub-nom">Nom complet<span className="required-mark">*</span></label>
                <input id="pub-nom" className="form-control" maxLength={150} value={champs.annonceur_nom} onChange={majChamp('annonceur_nom')} required />
              </div>
              <div className="col-md-6">
                <label className="form-label-aps" htmlFor="pub-ent">Entreprise</label>
                <input id="pub-ent" className="form-control" maxLength={150} value={champs.annonceur_entreprise} onChange={majChamp('annonceur_entreprise')} />
              </div>
              <div className="col-md-6">
                <label className="form-label-aps" htmlFor="pub-wa">Numéro WhatsApp<span className="required-mark">*</span></label>
                <input id="pub-wa" className="form-control" inputMode="tel" value={champs.annonceur_telephone}
                  onChange={majChamp('annonceur_telephone')} required />
                <p className="form-hint">La décision et le lien de paiement vous seront envoyés sur ce numéro.</p>
              </div>
              <div className="col-md-6">
                <label className="form-label-aps" htmlFor="pub-aemail">E-mail</label>
                <input id="pub-aemail" type="email" className="form-control" value={champs.annonceur_email} onChange={majChamp('annonceur_email')} />
              </div>
            </div>
          </fieldset>

          {erreur && <div className="alert alert-danger" role="alert">{erreur}</div>}

          <div className="pub-form-pied">
            {forfait && (
              <div>
                <small>Montant de la réservation</small>
                <strong>{montantDevise(forfait.prix, forfait.devise)}</strong>
                <small>Payable seulement après acceptation (frais de paiement en sus).</small>
              </div>
            )}
            <button type="submit" className="btn btn-primary btn-lg-aps" disabled={envoi || !forfait}>
              {envoi && <span className="spinner-border spinner-border-sm me-2" />}Valider ma demande
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
