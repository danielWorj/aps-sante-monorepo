// src/pages/RendezVous.jsx
//
// Page de prise de rendez-vous, adaptée aux APIs réelles :
//   - GET  /medecins/:id       (medecinService.obtenirMedecin)   -> fiche du praticien
//   - POST /rendez-vous        (medecinService.creerRendezVous)  -> création effective
// et au contexte d'authentification (AuthContext / useAuth) puisque
// POST /rendez-vous exige un compte PATIENT connecté (403 sinon) et
// que patient_id est TOUJOURS déduit du token côté serveur.
//
// Changements majeurs par rapport à la maquette statique d'origine :
//   - Plus de catalogue de "motifs" à prix fixes (MOTIFS/honoraires),
//     ni de commission/paiement/escrow : rien de tout cela n'existe
//     côté backend fourni. `motif` est un simple champ texte libre et
//     optionnel (1000 caractères max, cf. MOTIF_RENDEZ_VOUS_LONGUEUR_MAX).
//   - Plus de grille de créneaux prédéfinis (DAYS/TIME_SLOTS) : aucune
//     route de disponibilité n'est exposée par medecinService.js. Le
//     patient choisit donc directement une date + une heure
//     (date_creneau), combinées en ISO. À remplacer par un vrai
//     sélecteur de créneaux le jour où une API de disponibilité existe.
//   - Type de consultation (`type_rdv`) piloté par TYPES_RENDEZ_VOUS ;
//     "teleconsultation" est désactivée si le médecin n'a pas activé
//     teleconsultation_activee (sinon 400 côté serveur).
//   - `structure_id` n'est pertinent que pour "physique" ; aucune API
//     de structures n'est fournie ici, donc le champ n'est pas envoyé
//     (laissé undefined) — à brancher plus tard si un service dédié
//     apparaît (ex. structureService.listerStructures(medecin_id)).
//   - Étape "Vos informations" : n'est plus un formulaire, mais un
//     récapitulatif en lecture seule du compte patient connecté
//     (nom/prénom/email/téléphone viennent de useAuth().user), car ces
//     champs ne sont ni lus ni acceptés par POST /rendez-vous.
//   - Suppression totale de l'étape "Paiement" (pas d'API de paiement
//     fournie) ; le flux passe directement du choix du créneau à la
//     confirmation d'envoi, puis au ticket final.
//   - Le ticket de confirmation affiche les données réellement
//     renvoyées par POST /rendez-vous (id, code_unique, statut...) au
//     lieu d'un code fictif.
//
// ⚠️ La forme exacte de l'objet `medecin` renvoyé par GET /medecins/:id
// (nom des champs imbriqués specialite/ville_exercice/pays_exercice,
// URL de photo...) n'est pas garantie par les fichiers fournis : les
// accès ci-dessous restent défensifs (optional chaining + fallback) et
// sont à ajuster une fois la forme réelle de la réponse confirmée.

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import med1 from '../assets/img/med1.jpg';
import { useAuth } from '../context/AuthContext';
import {
  obtenirMedecin,
  creerRendezVous,
  TYPES_RENDEZ_VOUS,
  MOTIF_RENDEZ_VOUS_LONGUEUR_MAX,
} from '../services/medecinService';
import { inscrirePatient } from '../services/authService';
// Seul `listerPays` est utilisé ici : inscrirePatient() (authService.js)
// n'attend que { nom, prenom, email, telephone?, mot_de_passe, pays_id,
// date_naissance } — pas de ville_id. `listerVilles` (aussi exposé par
// geoService.js) n'a donc pas sa place dans ce formulaire tant que le
// backend n'exige pas de ville à l'inscription patient.
import { listerPays } from '../services/geoService';

function StepperNav({ steps, current }) {
  return (
    <div className="stepper" style={{ maxWidth: 640 }}>
      {steps.map((label, i) => {
        const n = i + 1;
        const cls = n === current ? 'is-active' : n < current ? 'is-done' : '';
        return (
          <Fragment key={label}>
            <span className={`step ${cls}`} data-step={n}>
              <span className="step-circle">{n}</span>
              <span className="step-label">{label}</span>
            </span>
            {n < steps.length && <span className="step-line" />}
          </Fragment>
        );
      })}
    </div>
  );
}

// Combine une date (YYYY-MM-DD) et une heure (HH:mm) locales en ISO
// 8601, tel qu'attendu par `date_creneau`.
function versDateCreneauISO(dateStr, heureStr) {
  if (!dateStr || !heureStr) return '';
  const d = new Date(`${dateStr}T${heureStr}:00`);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString();
}

function formatDateLabel(dateStr) {
  if (!dateStr) return '';
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: '2-digit', month: 'long' }).format(d);
}

// Date minimale sélectionnable dans le champ <input type="date"> : aujourd'hui.
function dateDuJourISO() {
  return new Date().toISOString().slice(0, 10);
}

/* =====================================================================
 * Calendrier "Choisir un jour" / "Choisir une heure" (repris de
 * ProfilMedecin.jsx) : remplace les <input type="date"> / <input
 * type="time"> par les mêmes sélecteurs visuels que la colonne
 * latérale de la fiche médecin, pour une expérience cohérente.
 * ===================================================================== */

// Convertit une Date en chaîne "YYYY-MM-DD" (jour local, sans fuseau),
// utilisée à la fois comme valeur de sélection du calendrier et comme
// clé de comparaison entre jours.
function dateVersISO(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// Retourne une nouvelle Date recalée à minuit (heure locale), pour ne
// comparer que les jours entre eux sans effet de bord lié à l'heure.
function debutJournee(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

const JOURS_SEMAINE = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const MOIS_LABELS = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

// Toutes les heures de la journée (00:00 à 23:00), en remplacement de
// la précédente liste restreinte de créneaux d'exemple.
const CRENEAUX_JOURNEE = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, '0')}:00`);

function CalendrierJour({ jourSelectionne, onSelectionner }) {
  const aujourdHui = useMemo(() => debutJournee(new Date()), []);
  const [moisAffiche, setMoisAffiche] = useState(
    () => new Date(aujourdHui.getFullYear(), aujourdHui.getMonth(), 1)
  );

  const estMoisCourant =
    moisAffiche.getFullYear() === aujourdHui.getFullYear() &&
    moisAffiche.getMonth() === aujourdHui.getMonth();

  const cellules = useMemo(() => {
    const premierJourMois = new Date(moisAffiche.getFullYear(), moisAffiche.getMonth(), 1);
    const nbJours = new Date(moisAffiche.getFullYear(), moisAffiche.getMonth() + 1, 0).getDate();
    // getDay() renvoie 0=dimanche..6=samedi ; on décale pour démarrer
    // la semaine un lundi (convention FR).
    const decalage = (premierJourMois.getDay() + 6) % 7;

    const jours = [];
    for (let i = 0; i < decalage; i += 1) jours.push(null);
    for (let j = 1; j <= nbJours; j += 1) {
      jours.push(new Date(moisAffiche.getFullYear(), moisAffiche.getMonth(), j));
    }
    return jours;
  }, [moisAffiche]);

  return (
    <div className="info-card">
      <h3><i className="fa-solid fa-calendar-days" /> Choisir un jour</h3>
      <div className="d-flex justify-content-between align-items-center mb-2">
        <button
          type="button"
          className="btn btn-outline-primary btn-sm-aps"
          onClick={() => setMoisAffiche((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
          disabled={estMoisCourant}
          aria-label="Mois précédent"
        >
          <i className="fa-solid fa-chevron-left" />
        </button>
        <strong style={{ fontSize: '.9rem' }}>
          {MOIS_LABELS[moisAffiche.getMonth()]} {moisAffiche.getFullYear()}
        </strong>
        <button
          type="button"
          className="btn btn-outline-primary btn-sm-aps"
          onClick={() => setMoisAffiche((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
          aria-label="Mois suivant"
        >
          <i className="fa-solid fa-chevron-right" />
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '.3rem', textAlign: 'center' }}>
        {JOURS_SEMAINE.map((j) => (
          <span key={j} style={{ fontSize: '.72rem', color: 'var(--ink-faint)' }}>{j}</span>
        ))}
        {cellules.map((jour, idx) => {
          if (!jour) return <span key={`vide-${idx}`} />;
          const iso = dateVersISO(jour);
          const estPasse = jour < aujourdHui;
          const estSelectionne = iso === jourSelectionne;
          return (
            <button
              key={iso}
              type="button"
              className="slot-mini"
              disabled={estPasse}
              onClick={() => onSelectionner(iso)}
              style={{
                cursor: estPasse ? 'not-allowed' : 'pointer',
                border: 0,
                opacity: estPasse ? 0.35 : 1,
                background: estSelectionne ? 'var(--primary, #1C8FE0)' : undefined,
                color: estSelectionne ? '#fff' : undefined,
              }}
            >
              {jour.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* =====================================================================
 * Carte de sélection de l'heure — reprend désormais toutes les heures
 * de la journée (CRENEAUX_JOURNEE) plutôt qu'une liste restreinte.
 * Désactivée tant qu'aucun jour n'a été choisi.
 * ===================================================================== */
function CarteHeure({ heureSelectionnee, onSelectionner, desactivee }) {
  return (
    <div className="info-card">
      <h3><i className="fa-solid fa-clock" /> Choisir une heure</h3>
      {desactivee ? (
        <p style={{ fontSize: '.85rem', color: 'var(--ink-soft)' }}>Sélectionnez d&apos;abord un jour ci-dessus.</p>
      ) : (
        <div className="slot-mini-grid">
          {CRENEAUX_JOURNEE.map((h) => (
            <button
              type="button"
              key={h}
              className="slot-mini"
              onClick={() => onSelectionner(h)}
              style={{
                cursor: 'pointer',
                border: 0,
                background: h === heureSelectionnee ? 'var(--primary, #1C8FE0)' : undefined,
                color: h === heureSelectionnee ? '#fff' : undefined,
              }}
            >
              {h}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function RendezVous() {
  const { id: medecinId } = useParams();
  const { user, status: authStatus, isAuthenticated, connecter } = useAuth();

  const totalSteps = 3;
  const [step, setStep] = useState(1);
  const formRef = useRef(null);

  // Étape 1 — créneau souhaité
  const [typeRdv, setTypeRdv] = useState('physique');
  const [date, setDate] = useState('');
  const [heure, setHeure] = useState('');
  const [motif, setMotif] = useState('');

  // Étape 2 (uniquement si personne n'est connectée) — infos patient à
  // inscrire avant de pouvoir poser la demande de rendez-vous. Non
  // utilisé si isAuthenticated est déjà vrai (dans ce cas on affiche
  // simplement le récap du compte connecté, voir plus bas).
  const [inscNom, setInscNom] = useState('');
  const [inscPrenom, setInscPrenom] = useState('');
  const [inscEmail, setInscEmail] = useState('');
  const [inscTelephone, setInscTelephone] = useState('');
  const [inscMotDePasse, setInscMotDePasse] = useState('');
  const [inscDateNaissance, setInscDateNaissance] = useState('');
  const [inscPaysId, setInscPaysId] = useState('');
  const [listePays, setListePays] = useState([]);
  const [chargementPays, setChargementPays] = useState(false);
  const [erreurPays, setErreurPays] = useState(null);

  // Fiche médecin (GET /medecins/:id)
  const [medecin, setMedecin] = useState(null);
  const [chargementMedecin, setChargementMedecin] = useState(true);
  const [erreurMedecin, setErreurMedecin] = useState(null);

  // Soumission (POST /rendez-vous)
  const [envoiEnCours, setEnvoiEnCours] = useState(false);
  const [erreurEnvoi, setErreurEnvoi] = useState(null);
  const [rendezVousCree, setRendezVousCree] = useState(null);
  const [copied, setCopied] = useState(false);

  // Le statut de connexion ne bloque plus l'accès à cette page : la
  // fiche du médecin et le choix du créneau restent consultables par
  // tout le monde. Ce n'est qu'au moment de la confirmation
  // (confirmerRendezVous) que l'état de connexion est vérifié — voir
  // plus bas.

  // Référentiel Pays, nécessaire uniquement pour le formulaire
  // d'inscription patient affiché à l'étape 2 quand personne n'est
  // connectée. Chargé une seule fois qu'on sait que l'utilisateur est
  // (encore) non authentifié, pour ne pas faire cet appel inutilement
  // si une session est en cours de restauration ou déjà active.
  useEffect(() => {
    if (authStatus !== 'unauthenticated') return undefined;
    let annule = false;

    async function chargerPays() {
      setChargementPays(true);
      setErreurPays(null);
      try {
        // listerPays() renvoie { pays: [{ pays_id, nom, code_iso2 }] }
        // (voir JSDoc de geoService.js) — PAS directement le tableau.
        const data = await listerPays();
        if (!annule) setListePays(data?.pays || []);
      } catch (err) {
        if (!annule) setErreurPays(err);
      } finally {
        if (!annule) setChargementPays(false);
      }
    }

    chargerPays();
    return () => {
      annule = true;
    };
  }, [authStatus]);

  useEffect(() => {
    let annule = false;
    if (!medecinId) return undefined;

    async function charger() {
      setChargementMedecin(true);
      setErreurMedecin(null);
      try {
        const data = await obtenirMedecin(medecinId);
        if (!annule) setMedecin(data);
      } catch (err) {
        if (!annule) setErreurMedecin(err);
      } finally {
        if (!annule) setChargementMedecin(false);
      }
    }

    charger();
    return () => {
      annule = true;
    };
  }, [medecinId]);

  const nomComplet = medecin
    ? `Dr. ${medecin.utilisateur?.prenom ?? ''} ${medecin.utilisateur?.nom ?? ''}`.trim()
    : '';
  const specialiteLabel = medecin?.specialite?.nom ?? medecin?.specialite ?? '';
  const villeLabel = medecin?.ville_exercice?.nom ?? medecin?.ville_exercice ?? '';
  const teleconsultationDisponible = Boolean(medecin?.teleconsultation_activee);

  const dateCreneauISO = useMemo(() => versDateCreneauISO(date, heure), [date, heure]);
  const dateLabel = formatDateLabel(date);
  const typeRdvLabel = TYPES_RENDEZ_VOUS.find((t) => t.valeur === typeRdv)?.libelle ?? typeRdv;

  // Valide (HTML5 checkValidity) les champs `required` d'une page du
  // stepper donnée. Réutilisée par goNext (étape 1) et par
  // confirmerRendezVous (étape 2, qui peut contenir soit le récap du
  // compte connecté, soit le formulaire d'inscription patient).
  const validerPage = (numero) => {
    const activePage = formRef.current?.querySelector(`[data-step-page="${numero}"]`);
    if (!activePage) return true;
    const fields = activePage.querySelectorAll('input[required], select[required], textarea[required]');
    for (const field of fields) {
      if (!field.checkValidity()) {
        field.reportValidity();
        return false;
      }
    }
    return true;
  };

  const goNext = () => {
    if (!validerPage(step)) return;
    setStep((s) => Math.min(s + 1, totalSteps));
  };
  const goPrev = () => setStep((s) => Math.max(s - 1, 1));

  // Confirmation de la demande de rendez-vous. C'est ICI, et seulement
  // ici, que l'état de connexion est déterminant :
  //   - connecté            -> on envoie directement POST /rendez-vous.
  //   - pas encore connecté -> on inscrit d'abord le patient avec les
  //     infos saisies dans le formulaire de l'étape 2 (POST
  //     /auth/register), on ouvre la session résultante (POST
  //     /auth/login via authService.connecter, déjà exposé par
  //     useAuth().connecter pour mettre à jour le contexte), puis on
  //     enchaîne avec la demande de rendez-vous elle-même. En cas
  //     d'échec à n'importe quelle étape, rien n'est considéré comme
  //     acquis : l'erreur est affichée et l'utilisateur reste à
  //     l'étape 2.
  const confirmerRendezVous = async () => {
    if (!validerPage(2)) return;

    setErreurEnvoi(null);
    setEnvoiEnCours(true);
    try {
      if (!isAuthenticated) {
        await inscrirePatient({
          nom: inscNom.trim(),
          prenom: inscPrenom.trim(),
          email: inscEmail.trim(),
          telephone: inscTelephone.trim() || undefined,
          mot_de_passe: inscMotDePasse,
          pays_id: inscPaysId,
          date_naissance: inscDateNaissance,
        });
        // Ouvre la session tout juste créée : à partir d'ici,
        // isAuthenticated devient vrai et patient_id sera correctement
        // déduit du token par le serveur pour le POST /rendez-vous
        // ci-dessous.
        await connecter(inscEmail.trim(), inscMotDePasse);
      }

      const donnees = {
        medecin_id: medecinId,
        type_rdv: typeRdv,
        date_creneau: dateCreneauISO,
        // structure_id : non envoyé — aucune API de structures n'est
        // fournie pour l'instant (voir note d'en-tête).
        ...(motif.trim() ? { motif: motif.trim() } : {}),
      };
      const rdv = await creerRendezVous(donnees);
      setRendezVousCree(rdv);
      setStep(3);
    } catch (err) {
      // Erreurs attendues côté serveur : 400 (email déjà utilisé,
      // téléconsultation non activée pour ce médecin, créneau/motif
      // invalide...), 403 (compte non patient), 404 (médecin
      // introuvable).
      setErreurEnvoi(err?.message || "La demande de rendez-vous a échoué. Veuillez réessayer.");
    } finally {
      setEnvoiEnCours(false);
    }
  };

  const copyCode = async () => {
    if (!rendezVousCree?.code_unique) return;
    try {
      await navigator.clipboard.writeText(rendezVousCree.code_unique);
    } catch {
      /* ignore — certains navigateurs/contexte bloquent l'API clipboard */
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const RecapRows = () => (
    <>
      <div className="recap-row"><span className="label">Professionnel</span><span className="val">{nomComplet || '—'}</span></div>
      <div className="recap-row"><span className="label">Spécialité</span><span className="val">{specialiteLabel || '—'}</span></div>
      <div className="recap-row"><span className="label">Type</span><span className="val">{typeRdvLabel}</span></div>
      <div className="recap-row"><span className="label">Date</span><span className="val">{dateLabel || '—'}</span></div>
      <div className="recap-row"><span className="label">Heure</span><span className="val">{heure || '—'}</span></div>
      {motif.trim() && <div className="recap-row"><span className="label">Motif</span><span className="val">{motif.trim()}</span></div>}
    </>
  );

  // --- Garde-fous d'accès -------------------------------------------------
  // Remarque : l'état de connexion (loading/authenticated/unauthenticated)
  // n'est plus bloquant ici — seul un rôle connecté incompatible avec la
  // prise de rendez-vous (ex. médecin, agent…) empêche l'accès au
  // formulaire ; une personne non connectée peut voir toute la page et
  // ne sera invitée à s'inscrire qu'au moment de confirmer sa demande.
  if (isAuthenticated && user?.role && user.role !== 'patient') {
    return (
      <section style={{ paddingTop: '2rem' }}>
        <div className="container-aps">
          <p>Seul un compte patient peut prendre rendez-vous. Vous êtes connecté avec un compte « {user.role} ».</p>
        </div>
      </section>
    );
  }

  return (
    <>
      <div className="container-aps" style={{ paddingTop: '1.1rem', fontSize: '.82rem' }}>
        <Link to="/" className="text-muted-soft">Accueil</Link>
        <i className="fa-solid fa-chevron-right text-faint mx-1" style={{ fontSize: '.6rem' }} />
        <Link to="/medecin" className="text-muted-soft">Médecins</Link>
        {medecin && (
          <>
            <i className="fa-solid fa-chevron-right text-faint mx-1" style={{ fontSize: '.6rem' }} />
            <Link to={`/profil/${medecinId}`} className="text-muted-soft">{nomComplet}</Link>
          </>
        )}
        <i className="fa-solid fa-chevron-right text-faint mx-1" style={{ fontSize: '.6rem' }} />
        <span className="text-faint">Rendez-vous</span>
      </div>

      <section style={{ paddingTop: '1.25rem' }}>
        <div className="container-aps">

          {chargementMedecin && <p>Chargement de la fiche du médecin…</p>}
          {erreurMedecin && !chargementMedecin && (
            <p className="text-danger">
              Impossible de charger ce médecin ({erreurMedecin.message || 'erreur inconnue'}).
            </p>
          )}

          {!chargementMedecin && !erreurMedecin && (
            <>
              <div className="d-flex align-items-center gap-3 mb-4">
                <div className="avatar-ph" style={{ width: 56, height: 56, fontSize: '1.3rem' }}>
                  <img src={medecin?.photo_url || med1} alt={nomComplet} />
                </div>
                <div>
                  <h1 style={{ fontSize: '1.35rem' }}>Prendre rendez-vous avec {nomComplet}</h1>
                  <p className="mb-0" style={{ fontSize: '.86rem' }}>
                    {specialiteLabel}{villeLabel ? ` · ${villeLabel}` : ''}
                  </p>
                </div>
              </div>

              <div>
                <StepperNav steps={['Créneau', 'Vos informations', 'Confirmation']} current={step} />

                <div className="rdv-shell">
                  <form ref={formRef} onSubmit={(e) => e.preventDefault()}>
                    {/* Étape 1 : créneau + type + motif */}
                    <div className={`form-page ${step === 1 ? 'active' : ''}`} data-step-page="1">
                      <div className="info-card">
                        <h3><i className="fa-solid fa-stethoscope" /> Type de consultation</h3>
                        <div className="row g-2">
                          {TYPES_RENDEZ_VOUS.map((t) => {
                            const desactive = t.valeur === 'teleconsultation' && !teleconsultationDisponible;
                            return (
                              <div className="col-md-6" key={t.valeur}>
                                <div className="form-check border rounded-3 p-3" style={{ borderColor: 'var(--line-strong)' }}>
                                  <input
                                    className="form-check-input"
                                    type="radio"
                                    name="type-rdv"
                                    id={`type-${t.valeur}`}
                                    checked={typeRdv === t.valeur}
                                    disabled={desactive}
                                    onChange={() => setTypeRdv(t.valeur)}
                                  />
                                  <label className="form-check-label" htmlFor={`type-${t.valeur}`} style={{ fontSize: '.86rem', fontWeight: 700 }}>
                                    {t.libelle}
                                  </label>
                                  {desactive && (
                                    <div className="text-faint" style={{ fontSize: '.75rem' }}>
                                      Non proposée par ce médecin
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <CalendrierJour
                        jourSelectionne={date}
                        onSelectionner={(iso) => { setDate(iso); setHeure(''); }}
                      />

                      <div className="mt-3">
                        <CarteHeure
                          heureSelectionnee={heure}
                          onSelectionner={setHeure}
                          desactivee={!date}
                        />
                      </div>

                      <div className="info-card">
                        <h3><i className="fa-solid fa-note-sticky" /> Motif (facultatif)</h3>
                        <textarea
                          className="form-control"
                          id="rdv-motif"
                          rows="3"
                          maxLength={MOTIF_RENDEZ_VOUS_LONGUEUR_MAX}
                          placeholder="Décrivez brièvement votre besoin"
                          value={motif}
                          onChange={(e) => setMotif(e.target.value)}
                        />
                        <div className="text-faint" style={{ fontSize: '.75rem', textAlign: 'right' }}>
                          {motif.length}/{MOTIF_RENDEZ_VOUS_LONGUEUR_MAX}
                        </div>
                      </div>

                      <div className="form-nav-actions">
                        <span />
                        <button type="button" className="btn btn-primary" onClick={goNext}>
                          Continuer <i className="fa-solid fa-arrow-right" />
                        </button>
                      </div>
                    </div>

                    {/* Étape 2 : soit le récap du compte déjà connecté, soit
                        l'inscription patient complète si personne n'est
                        connectée — la vérification de l'état de connexion
                        n'a lieu qu'ici, pas avant. */}
                    <div className={`form-page ${step === 2 ? 'active' : ''}`} data-step-page="2">
                      {authStatus === 'loading' ? (
                        <div className="info-card">
                          <p className="text-faint mb-0" style={{ fontSize: '.85rem' }}>
                            Vérification de votre session…
                          </p>
                        </div>
                      ) : isAuthenticated ? (
                        <div className="info-card">
                          <h3><i className="fa-solid fa-user" /> Vos informations</h3>
                          <p className="text-faint" style={{ fontSize: '.82rem' }}>
                            Le rendez-vous sera associé à votre compte connecté.
                          </p>
                          <div className="row">
                            <div className="col-md-6 mb-3">
                              <div className="form-label-aps">Nom complet</div>
                              <div>{`${user?.prenom ?? ''} ${user?.nom ?? ''}`.trim() || '—'}</div>
                            </div>
                            <div className="col-md-6 mb-3">
                              <div className="form-label-aps">Téléphone</div>
                              <div>{user?.telephone || '—'}</div>
                            </div>
                            <div className="col-md-6 mb-3">
                              <div className="form-label-aps">E-mail</div>
                              <div>{user?.email || '—'}</div>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="info-card">
                          <h3><i className="fa-solid fa-user-plus" /> Créez votre compte patient</h3>
                          <p className="text-faint" style={{ fontSize: '.82rem' }}>
                            Vous n&apos;êtes pas connecté(e) : renseignez vos informations pour créer votre
                            compte patient, il sera utilisé pour cette demande de rendez-vous et les suivantes.
                          </p>
                          <div className="row">
                            <div className="col-md-6 mb-3">
                              <label className="form-label-aps" htmlFor="insc-prenom">Prénom</label>
                              <input
                                type="text"
                                className="form-control"
                                id="insc-prenom"
                                required
                                value={inscPrenom}
                                onChange={(e) => setInscPrenom(e.target.value)}
                              />
                            </div>
                            <div className="col-md-6 mb-3">
                              <label className="form-label-aps" htmlFor="insc-nom">Nom</label>
                              <input
                                type="text"
                                className="form-control"
                                id="insc-nom"
                                required
                                value={inscNom}
                                onChange={(e) => setInscNom(e.target.value)}
                              />
                            </div>
                            <div className="col-md-6 mb-3">
                              <label className="form-label-aps" htmlFor="insc-email">E-mail</label>
                              <input
                                type="email"
                                className="form-control"
                                id="insc-email"
                                required
                                value={inscEmail}
                                onChange={(e) => setInscEmail(e.target.value)}
                              />
                            </div>
                            <div className="col-md-6 mb-3">
                              <label className="form-label-aps" htmlFor="insc-telephone">Téléphone (facultatif)</label>
                              <input
                                type="tel"
                                className="form-control"
                                id="insc-telephone"
                                value={inscTelephone}
                                onChange={(e) => setInscTelephone(e.target.value)}
                              />
                            </div>
                            <div className="col-md-6 mb-3">
                              <label className="form-label-aps" htmlFor="insc-mot-de-passe">Mot de passe</label>
                              <input
                                type="password"
                                className="form-control"
                                id="insc-mot-de-passe"
                                required
                                minLength={8}
                                value={inscMotDePasse}
                                onChange={(e) => setInscMotDePasse(e.target.value)}
                              />
                            </div>
                            <div className="col-md-6 mb-3">
                              <label className="form-label-aps" htmlFor="insc-date-naissance">Date de naissance</label>
                              <input
                                type="date"
                                className="form-control"
                                id="insc-date-naissance"
                                required
                                max={dateDuJourISO()}
                                value={inscDateNaissance}
                                onChange={(e) => setInscDateNaissance(e.target.value)}
                              />
                            </div>
                            <div className="col-md-6 mb-3">
                              <label className="form-label-aps" htmlFor="insc-pays">Pays</label>
                              <select
                                className="form-control"
                                id="insc-pays"
                                required
                                disabled={chargementPays || Boolean(erreurPays)}
                                value={inscPaysId}
                                onChange={(e) => setInscPaysId(e.target.value)}
                              >
                                <option value="" disabled>
                                  {chargementPays ? 'Chargement…' : 'Sélectionner un pays'}
                                </option>
                                {listePays.map((p) => (
                                  <option key={p.pays_id} value={p.pays_id}>{p.nom}</option>
                                ))}
                              </select>
                              {erreurPays && (
                                <div className="text-danger" style={{ fontSize: '.75rem' }}>
                                  Impossible de charger la liste des pays. Rechargez la page.
                                </div>
                              )}
                            </div>
                          </div>
                          <p className="text-faint mb-0" style={{ fontSize: '.78rem' }}>
                            Déjà un compte ? <Link to={`/connexion?next=${encodeURIComponent(window.location.pathname)}`}>Connectez-vous</Link> puis revenez sur cette page.
                          </p>
                        </div>
                      )}

                      {erreurEnvoi && (
                        <div
                          className="p-3 mb-3"
                          style={{ background: 'var(--danger-tint, #fdecea)', borderRadius: 10, fontSize: '.85rem' }}
                        >
                          {erreurEnvoi}
                        </div>
                      )}

                      <div className="form-nav-actions">
                        <button type="button" className="btn btn-ghost" onClick={goPrev} disabled={envoiEnCours}>
                          <i className="fa-solid fa-arrow-left" /> Retour
                        </button>
                        <button
                          type="button"
                          className="btn btn-primary"
                          onClick={confirmerRendezVous}
                          disabled={envoiEnCours || !dateCreneauISO}
                        >
                          {envoiEnCours ? 'Envoi…' : 'Confirmer le rendez-vous'} <i className="fa-solid fa-check" />
                        </button>
                      </div>
                    </div>

                    {/* Étape 3 : confirmation */}
                    <div className={`form-page ${step === 3 ? 'active' : ''}`} data-step-page="3">
                      {rendezVousCree && (
                        <div className="ticket">
                          <div className="ticket-top">
                            <div className="ticket-check"><i className="fa-solid fa-check" /></div>
                            <h3 style={{ fontSize: '1.15rem', marginBottom: '.3rem' }}>Rendez-vous confirmé</h3>
                            <p style={{ fontSize: '.87rem', marginBottom: 0 }}>
                              Statut actuel : {rendezVousCree.statut ?? 'créé'}. Un rappel vous sera envoyé avant votre consultation.
                            </p>
                          </div>
                          <div className="ticket-divider" />
                          <div className="ticket-bottom">
                            {rendezVousCree.code_unique && (
                              <>
                                <div className="ticket-code">{rendezVousCree.code_unique}</div>
                                <div className="ticket-code-label">Code à présenter à l&apos;accueil</div>
                                <div className="qr-ph"><i className="fa-solid fa-qrcode" /></div>
                              </>
                            )}

                            <table className="hours-table">
                              <tbody>
                                <tr><td>Professionnel</td><td>{nomComplet}</td></tr>
                                <tr><td>Type</td><td>{typeRdvLabel}</td></tr>
                                <tr><td>Date</td><td>{dateLabel}</td></tr>
                                <tr><td>Heure</td><td>{heure}</td></tr>
                                {motif.trim() && <tr><td>Motif</td><td>{motif.trim()}</td></tr>}
                              </tbody>
                            </table>

                            <div className="d-flex gap-2 mt-3">
                              {rendezVousCree.code_unique && (
                                <button type="button" className="btn btn-outline-primary btn-block-aps" onClick={copyCode}>
                                  <i className={`fa-solid ${copied ? 'fa-check' : 'fa-copy'}`} /> {copied ? 'Copié' : 'Copier le code'}
                                </button>
                              )}
                              <Link to="/medecin" className="btn btn-primary btn-block-aps">Retour à l&apos;annuaire</Link>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </form>

                  {/* Récapitulatif latéral */}
                  {step < 3 && (
                    <aside className="recap-card">
                      <h3><i className="fa-solid fa-receipt" /> Récapitulatif</h3>
                      <RecapRows />
                    </aside>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </section>
    </>
  );
}