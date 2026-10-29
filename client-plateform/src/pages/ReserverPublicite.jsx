// src/pages/ReserverPublicite.jsx
//
// Réservation d'un espace publicitaire (v9), ouverte depuis la carte
// « Réserver cet espace » d'une page (?page=PAGE_…). Page PUBLIQUE :
//   - visiteur sans compte : il choisit son pays de diffusion et crée son
//     compte annonceur dans le même formulaire (étape 4) ; le serveur crée
//     le compte + la demande et ouvre la session ;
//   - déjà inscrit : « Rejoindre mon espace » mène à la connexion puis
//     revient ici, le brouillon (hors visuel et mot de passe) conservé.
//
//   1. Position et durée : forfaits de la page, par position dans le slider
//      (la 1re position, affichée en premier, coûte le plus cher).
//   2. Date de début : la position est exclusive ; les périodes déjà prises
//      et la prochaine date libre viennent du serveur.
//   3. La publicité : titre, brève description, flyer / image, contact
//      téléphone, e-mail, localisation.
//   4. L'annonceur : nom, entreprise, téléphone, e-mail — pré-remplis depuis
//      le compte ou la dernière réservation.
//   5. Le canal de notification (WhatsApp, SMS ou e-mail), en cartes.
//
// Après validation, la demande part en modération : l'annonceur reçoit par
// le canal choisi le refus motivé, ou l'acceptation avec le lien de
// paiement (carte bancaire Stripe ou Mobile Money).
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  PAGES_PUBLICITE,
  libellePosition,
  listerForfaitsPage,
  obtenirDisponibilites,
  obtenirProfilAnnonceur,
  reserverEspace,
  reserverEspaceAvecCompte,
} from '../services/publiciteService';
import { listerPays } from '../services/geoService';
import { montantDevise } from '../utils/fonds';
import './Publicite.css';
import CaseAcceptationLegale, { MESSAGE_CGU_REQUISES } from '../components/legal/CaseAcceptationLegale';

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
const COMPTE_VIDE = { prenom: '', nom: '', email: '', mot_de_passe: '', confirmation: '' };

// Canaux de notification de l'annonceur (publicite.canal_notification).
const CANAUX = [
  { code: 'whatsapp', icone: 'fa-brands fa-whatsapp', titre: 'WhatsApp', texte: 'Message instantané, lien de paiement en un clic.', par: 'par WhatsApp' },
  { code: 'sms', icone: 'fa-solid fa-comment-sms', titre: 'SMS', texte: 'Sur tout téléphone, même sans connexion Internet.', par: 'par SMS' },
  { code: 'email', icone: 'fa-solid fa-envelope', titre: 'E-mail', texte: 'Récapitulatif détaillé et bouton de paiement.', par: 'par e-mail' },
];
const canalDe = (code) => CANAUX.find((c) => c.code === code) ?? CANAUX[0];
const LONGUEUR_MIN_MOT_DE_PASSE = 8;

// Brouillon conservé le temps d'aller se connecter (« Rejoindre mon espace ») :
// jamais le visuel ni le mot de passe.
const CLE_BROUILLON = 'aps.reservation-publicite';
function lireBrouillon() {
  try {
    const brut = sessionStorage.getItem(CLE_BROUILLON);
    sessionStorage.removeItem(CLE_BROUILLON);
    return brut ? JSON.parse(brut) : null;
  } catch {
    return null;
  }
}

export default function ReserverPublicite() {
  const [params, setParams] = useSearchParams();
  const page = params.get('page') || PAGES_PUBLICITE.accueil;
  const { user, status, ouvrirSession } = useAuth();
  const invite = status === 'unauthenticated';
  const [brouillon] = useState(lireBrouillon);

  const [paysListe, setPaysListe] = useState([]);
  const [paysId, setPaysId] = useState(brouillon?.paysId ?? '');
  const paysDiffusion = user?.pays_id ?? paysId;
  const [forfaits, setForfaits] = useState(null);
  const [erreurForfaits, setErreurForfaits] = useState(null);
  const [forfaitId, setForfaitId] = useState(brouillon?.forfaitId ?? '');
  const [dispoChargee, setDispo] = useState(null);
  const [dateDebut, setDateDebut] = useState(brouillon?.dateDebut ?? '');
  const [champs, setChamps] = useState(() => ({ ...CHAMPS_VIDES, ...brouillon?.champs }));
  const [compte, setCompte] = useState(COMPTE_VIDE);
  const [canal, setCanal] = useState(brouillon?.canal ?? 'whatsapp');
  const [visuel, setVisuel] = useState(null);
  const [apercu, setApercu] = useState(null);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState(null);
  const [compteExistant, setCompteExistant] = useState(false);
  const [succes, setSucces] = useState(null);
  const [compteCree, setCompteCree] = useState(false);

  // Visiteur : liste des pays (les offres dépendent du pays de diffusion).
  useEffect(() => {
    if (!invite) return;
    listerPays().then((d) => setPaysListe(d.pays || [])).catch(() => setPaysListe([]));
  }, [invite]);

  // Forfaits de la page (pays du compte, ou pays choisi par le visiteur).
  useEffect(() => {
    if (status === 'loading' || !paysDiffusion) return undefined;
    let annule = false;
    listerForfaitsPage(page, paysDiffusion)
      .then((f) => { if (!annule) setForfaits(f); })
      .catch((e) => { if (!annule) { setForfaits([]); setErreurForfaits(e.message); } });
    return () => { annule = true; };
  }, [page, paysDiffusion, status]);

  // Pré-remplissage de l'annonceur (compte existant seulement).
  useEffect(() => {
    if (status !== 'authenticated') return;
    obtenirProfilAnnonceur()
      .then(({ annonceur }) => setChamps((c) => ({
        ...c,
        annonceur_nom: c.annonceur_nom || annonceur.annonceur_nom || '',
        annonceur_entreprise: c.annonceur_entreprise || annonceur.annonceur_entreprise || '',
        annonceur_telephone: c.annonceur_telephone || annonceur.annonceur_telephone || '',
        annonceur_email: c.annonceur_email || annonceur.annonceur_email || '',
      })))
      .catch(() => {});
  }, [status]);

  // Disponibilité de la position choisie (la date d'un brouillon restauré
  // est gardée une fois ; ensuite, la prochaine date libre est proposée).
  const dateRestauree = useRef(Boolean(brouillon?.dateDebut));
  useEffect(() => {
    if (!forfaitId) return undefined;
    let annule = false;
    obtenirDisponibilites(forfaitId)
      .then((d) => {
        if (annule) return;
        setDispo(d);
        if (dateRestauree.current) dateRestauree.current = false;
        else setDateDebut(d.prochaine_date_libre);
      })
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
  const majCompte = (k) => (e) => setCompte((c) => ({ ...c, [k]: e.target.value }));

  const sauverBrouillon = () => {
    try {
      sessionStorage.setItem(CLE_BROUILLON, JSON.stringify({ paysId, forfaitId, dateDebut, champs, canal }));
    } catch {
      // Stockage indisponible (navigation privée…) : la connexion reste possible.
    }
  };
  const lienConnexion = { pathname: '/login' };
  const etatConnexion = { from: `/publicite/reserver?page=${encodeURIComponent(page)}` };

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

  const [accepteCgu, setAccepteCgu] = useState(false);

  const soumettre = async (e) => {
    e.preventDefault();
    setErreur(null);
    setCompteExistant(false);
    if (!forfait) return setErreur('Choisissez une position et une durée.');
    if (!dateDebut) return setErreur('Choisissez la date de début de diffusion.');
    if (conflit) return setErreur('Cette position est déjà réservée sur la période choisie.');
    if (!visuel) return setErreur('Ajoutez le flyer ou l’image de votre publicité.');
    if (canal === 'email' && !invite && !champs.annonceur_email.trim()) {
      return setErreur('Indiquez votre e-mail pour recevoir la décision par e-mail.');
    }
    if (!accepteCgu) return setErreur(MESSAGE_CGU_REQUISES);
    if (invite) {
      if (!compte.prenom.trim() || !compte.nom.trim()) return setErreur('Indiquez votre prénom et votre nom.');
      if (!compte.email.trim()) return setErreur('Indiquez votre e-mail : il servira d’identifiant de connexion.');
      if (compte.mot_de_passe.length < LONGUEUR_MIN_MOT_DE_PASSE) {
        return setErreur(`Le mot de passe doit contenir au moins ${LONGUEUR_MIN_MOT_DE_PASSE} caractères.`);
      }
      if (compte.mot_de_passe !== compte.confirmation) return setErreur('Les deux mots de passe ne correspondent pas.');
    }
    setEnvoi(true);
    try {
      const reservation = {
        ...champs, forfait_publicitaire_id: forfait.forfait_publicitaire_id, date_debut: dateDebut, canal_notification: canal,
        accepte_cgu: true,
      };
      let r;
      if (invite) {
        // Le nom et l'e-mail de l'annonceur sont ceux du compte créé.
        r = await reserverEspaceAvecCompte({
          ...reservation,
          annonceur_nom: `${compte.prenom.trim()} ${compte.nom.trim()}`,
          annonceur_email: compte.email.trim(),
          compte_prenom: compte.prenom.trim(),
          compte_nom: compte.nom.trim(),
          compte_email: compte.email.trim(),
          mot_de_passe: compte.mot_de_passe,
        }, visuel);
        ouvrirSession(r);
        setCompteCree(true);
      } else {
        r = await reserverEspace(reservation, visuel);
      }
      setSucces(r.publicite);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      if (err.data?.code === 'COMPTE_EXISTANT') {
        setCompteExistant(true);
        setErreur(err.message);
        return;
      }
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
            Nous vérifions votre publicité « {succes.titre} ». Vous recevrez la décision {canalDe(succes.canal_notification).par}{' '}
            {succes.canal_notification === 'email' ? 'à' : 'au'}{' '}
            <strong>{succes.canal_notification === 'email' ? succes.annonceur_email : succes.annonceur_telephone}</strong> :
            en cas d’acceptation, le message contient le lien pour payer (carte bancaire ou Mobile Money) et
            programmer la diffusion.
          </p>
          {compteCree && (
            <p className="status-card-text">
              Votre compte annonceur est créé et vous êtes connecté : retrouvez vos demandes dans « Mes publicités ».
            </p>
          )}
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
          {invite && (
            <div className="pub-compte-existant">
              <p><i className="fa-solid fa-circle-user" />Vous avez déjà un compte annonceur ?</p>
              <Link to={lienConnexion} state={etatConnexion} onClick={sauverBrouillon} className="btn btn-outline-primary btn-sm-aps">
                <i className="fa-solid fa-right-to-bracket" /> Rejoindre mon espace
              </Link>
            </div>
          )}
        </header>

        {status === 'loading' ? (
          <div className="text-center py-5"><div className="spinner-border text-primary" role="status" /></div>
        ) : (
        <form onSubmit={soumettre} className="pub-form" noValidate>
          {/* 1. Page, position et durée */}
          <fieldset className="pub-bloc">
            <legend><span className="pub-etape">1</span> Page, position et durée</legend>
            {invite && (
              <>
                <label className="form-label-aps" htmlFor="pub-pays">Pays de diffusion<span className="required-mark">*</span></label>
                <select id="pub-pays" className="form-select mb-3" value={paysId} required
                  onChange={(e) => {
                    setForfaits(null);
                    setForfaitId('');
                    setErreurForfaits(null);
                    setPaysId(e.target.value);
                  }}>
                  <option value="">— Choisir un pays —</option>
                  {paysListe.map((p) => <option key={p.pays_id} value={p.pays_id}>{p.nom}</option>)}
                </select>
              </>
            )}
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

            {!paysDiffusion && <p className="form-hint">Choisissez votre pays pour voir les offres.</p>}
            {paysDiffusion && forfaits === null && <p className="form-hint">Chargement des offres…</p>}
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

          {/* 4. L'annonceur : visiteur → création du compte annonceur */}
          {invite ? (
          <fieldset className="pub-bloc">
            <legend><span className="pub-etape">4</span> Vos informations et votre compte</legend>
            <p className="form-hint mt-0">
              Votre compte annonceur vous permet de suivre votre demande, de payer et de consulter les statistiques de diffusion.
            </p>
            <div className="row g-3">
              <div className="col-md-6">
                <label className="form-label-aps" htmlFor="cpt-prenom">Prénom<span className="required-mark">*</span></label>
                <input id="cpt-prenom" className="form-control" maxLength={100} autoComplete="given-name"
                  value={compte.prenom} onChange={majCompte('prenom')} required />
              </div>
              <div className="col-md-6">
                <label className="form-label-aps" htmlFor="cpt-nom">Nom<span className="required-mark">*</span></label>
                <input id="cpt-nom" className="form-control" maxLength={100} autoComplete="family-name"
                  value={compte.nom} onChange={majCompte('nom')} required />
              </div>
              <div className="col-md-6">
                <label className="form-label-aps" htmlFor="pub-ent">Entreprise</label>
                <input id="pub-ent" className="form-control" maxLength={150} autoComplete="organization"
                  value={champs.annonceur_entreprise} onChange={majChamp('annonceur_entreprise')} />
              </div>
              <div className="col-md-6">
                <label className="form-label-aps" htmlFor="pub-wa">Téléphone<span className="required-mark">*</span></label>
                <input id="pub-wa" className="form-control" inputMode="tel" autoComplete="tel" value={champs.annonceur_telephone}
                  onChange={majChamp('annonceur_telephone')} required />
                <p className="form-hint">Reçoit la décision si vous choisissez WhatsApp ou SMS (étape 5).</p>
              </div>
              <div className="col-md-12">
                <label className="form-label-aps" htmlFor="cpt-email">E-mail<span className="required-mark">*</span></label>
                <input id="cpt-email" type="email" className="form-control" autoComplete="email"
                  value={compte.email} onChange={majCompte('email')} required />
                <p className="form-hint">Il servira d’identifiant pour vous connecter à votre espace.</p>
              </div>
              <div className="col-md-6">
                <label className="form-label-aps" htmlFor="cpt-mdp">Mot de passe<span className="required-mark">*</span></label>
                <input id="cpt-mdp" type="password" className="form-control" autoComplete="new-password"
                  minLength={LONGUEUR_MIN_MOT_DE_PASSE} value={compte.mot_de_passe} onChange={majCompte('mot_de_passe')} required />
                <p className="form-hint">{LONGUEUR_MIN_MOT_DE_PASSE} caractères minimum.</p>
              </div>
              <div className="col-md-6">
                <label className="form-label-aps" htmlFor="cpt-mdp2">Confirmer le mot de passe<span className="required-mark">*</span></label>
                <input id="cpt-mdp2" type="password" className="form-control" autoComplete="new-password"
                  value={compte.confirmation} onChange={majCompte('confirmation')} required />
              </div>
            </div>
          </fieldset>
          ) : (
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
                <label className="form-label-aps" htmlFor="pub-wa">Téléphone<span className="required-mark">*</span></label>
                <input id="pub-wa" className="form-control" inputMode="tel" value={champs.annonceur_telephone}
                  onChange={majChamp('annonceur_telephone')} required />
                <p className="form-hint">Reçoit la décision si vous choisissez WhatsApp ou SMS (étape 5).</p>
              </div>
              <div className="col-md-6">
                <label className="form-label-aps" htmlFor="pub-aemail">
                  E-mail{canal === 'email' && <span className="required-mark">*</span>}
                </label>
                <input id="pub-aemail" type="email" className="form-control" value={champs.annonceur_email}
                  onChange={majChamp('annonceur_email')} required={canal === 'email'} />
              </div>
            </div>
          </fieldset>
          )}

          {/* 5. Canal de notification */}
          <fieldset className="pub-bloc">
            <legend><span className="pub-etape">5</span> Où recevoir la décision ?</legend>
            <p className="form-hint mt-0">
              Nous vous informons par ce canal de l’acceptation ou du refus de votre publicité. En cas d’acceptation,
              le message contient le lien pour payer par carte bancaire (Stripe) ou Mobile Money.
            </p>
            <div className="pub-canaux" role="radiogroup" aria-label="Canal de notification">
              {CANAUX.map((c) => {
                const destination = c.code === 'email'
                  ? (invite ? compte.email : champs.annonceur_email).trim()
                  : champs.annonceur_telephone.trim();
                return (
                  <label key={c.code} className={`pub-canal is-${c.code}${canal === c.code ? ' is-choisi' : ''}`}>
                    <input type="radio" name="canal_notification" value={c.code} className="visually-hidden"
                      checked={canal === c.code} onChange={() => setCanal(c.code)} />
                    <span className="pub-canal-coche" aria-hidden="true"><i className="fa-solid fa-check" /></span>
                    <span className="pub-canal-icone" aria-hidden="true"><i className={c.icone} /></span>
                    <span className="pub-canal-titre">{c.titre}</span>
                    <span className="pub-canal-texte">{c.texte}</span>
                    <span className={`pub-canal-destination${destination ? '' : ' is-vide'}`}>
                      {destination || (c.code === 'email' ? 'E-mail à renseigner' : 'Téléphone à renseigner')}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          {erreur && (
            <div className="alert alert-danger" role="alert">
              {erreur}
              {compteExistant && (
                <div className="mt-2">
                  <Link to={lienConnexion} state={etatConnexion} onClick={sauverBrouillon} className="btn btn-primary btn-sm-aps">
                    <i className="fa-solid fa-right-to-bracket" /> Rejoindre mon espace
                  </Link>
                </div>
              )}
            </div>
          )}

          <CaseAcceptationLegale id="pub-cgu" className="form-check mb-3" checked={accepteCgu} onChange={setAccepteCgu} />

          <div className="pub-form-pied">
            {forfait && (
              <div>
                <small>Montant de la réservation</small>
                <strong>{montantDevise(forfait.prix, forfait.devise)}</strong>
                <small>Payable seulement après acceptation (frais de paiement en sus).</small>
              </div>
            )}
            <button type="submit" className="btn btn-primary btn-lg-aps" disabled={envoi}>
              {envoi && <span className="spinner-border spinner-border-sm me-2" />}Valider ma demande
            </button>
          </div>
        </form>
        )}
      </div>
    </section>
  );
}
