// src/pages/DemandeRapide.jsx
//
// RDV ALÉATOIRE — page PUBLIQUE « Demande rapide » (/demande-rapide).
//
// Ouverte à tous, comme la prise de RDV avec un médecin précis
// (RendezVous.jsx) : le visiteur décrit son besoin (spécialité, ville, jour,
// heure, type, motif) puis, s'il n'est pas connecté :
//   - soit il crée son compte patient dans le même formulaire ;
//   - soit il clique « J'ai déjà un compte » : la fenêtre de connexion
//     (ConnexionModale) l'identifie sans quitter la page.
// La demande est publiée sous ce compte, puis le patient est envoyé dans son
// espace (« Demande rapide ») pour suivre les réponses des médecins.
//
// Jour et heure sont ceux de la ville choisie : le serveur les convertit
// dans le fuseau de son pays (et vérifie le délai minimum de 2 h).
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import ConnexionModale from '../components/auth/ConnexionModale';
import { useToast } from '../components/feedback';
import { useAuth } from '../context/AuthContext';
import { inscrirePatient } from '../services/authService';
import { listerPays, listerVilles } from '../services/geoService';
import { listerSpecialites } from '../services/medecinService';
import { publierOffre } from '../services/offreRdvService';

const TYPES_RDV = [
  { valeur: 'physique', libelle: 'Au cabinet', icone: 'fa-stethoscope' },
  { valeur: 'teleconsultation', libelle: 'En vidéo', icone: 'fa-video' },
];

const pad = (n) => String(n).padStart(2, '0');

/** AAAA-MM-JJ local (borne d'un <input type="date">). */
function jourLocal(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const INSCRIPTION_VIDE = {
  prenom: '',
  nom: '',
  email: '',
  telephone: '',
  mot_de_passe: '',
  date_naissance: '',
  pays_id: '',
};

export default function DemandeRapide() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { user, status, isAuthenticated, connecter, deconnecter } = useAuth();
  const estPatient = isAuthenticated && user?.role === 'patient';
  const autreRole = isAuthenticated && user?.role && user.role !== 'patient';

  // Référentiels
  const [specialites, setSpecialites] = useState([]);
  const [listePays, setListePays] = useState([]);
  const [villes, setVilles] = useState([]);

  // Besoin (pré-rempli depuis l'annuaire : ?specialite_id&pays_id&ville_id)
  const [besoin, setBesoin] = useState(() => ({
    specialite_id: params.get('specialite_id') || '',
    pays_id: params.get('pays_id') || '',
    ville_id: params.get('ville_id') || '',
    type_rdv: params.get('type_rdv') === 'teleconsultation' ? 'teleconsultation' : 'physique',
    jour: '',
    heure: '',
    motif: '',
  }));

  // Compte patient à créer (visiteur non connecté)
  const [insc, setInsc] = useState(INSCRIPTION_VIDE);
  const [connexionOuverte, setConnexionOuverte] = useState(false);

  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState(null);

  useEffect(() => {
    listerSpecialites().then((s) => setSpecialites(s || [])).catch(() => setSpecialites([]));
    listerPays()
      .then((d) => setListePays(d?.pays || []))
      .catch(() => setListePays([]));
  }, []);

  // Pays par défaut : celui du patient connecté, sinon le premier du référentiel.
  const paysParDefaut = user?.pays_id || listePays[0]?.pays_id || '';
  const paysId = besoin.pays_id || paysParDefaut;

  useEffect(() => {
    if (!paysId) return undefined;
    let actif = true;
    listerVilles(paysId)
      .then((d) => {
        if (!actif) return;
        const liste = d?.villes || [];
        setVilles(liste);
        // Ville d'un autre pays (changement de pays) : on la retire.
        setBesoin((b) => (b.ville_id && !liste.some((v) => v.ville_id === b.ville_id) ? { ...b, ville_id: '' } : b));
      })
      .catch(() => actif && setVilles([]));
    return () => {
      actif = false;
    };
  }, [paysId]);

  const majBesoin = (champ) => (e) => setBesoin((b) => ({ ...b, [champ]: e.target.value }));
  const majInsc = (champ) => (e) => setInsc((f) => ({ ...f, [champ]: e.target.value }));

  const villeNom = villes.find((v) => v.ville_id === besoin.ville_id)?.nom;

  const publier = async (e) => {
    e.preventDefault();
    if (autreRole) return;
    setErreur(null);
    const { specialite_id, ville_id, type_rdv, jour, heure, motif } = besoin;
    if (!specialite_id || !ville_id || !jour || !heure) {
      setErreur("Choisissez la spécialité, la ville, le jour et l'heure.");
      return;
    }
    setEnvoi(true);
    try {
      if (!isAuthenticated) {
        // Même enchaînement que RendezVous.jsx : inscription puis session.
        await inscrirePatient({
          nom: insc.nom.trim(),
          prenom: insc.prenom.trim(),
          email: insc.email.trim(),
          telephone: insc.telephone.trim() || undefined,
          mot_de_passe: insc.mot_de_passe,
          pays_id: insc.pays_id || paysId,
          date_naissance: insc.date_naissance,
        });
        await connecter(insc.email.trim(), insc.mot_de_passe);
      }
      const data = await publierOffre({
        specialite_id,
        ville_id,
        type_rdv,
        jour,
        heure,
        motif: motif.trim() || null,
      });
      toast.succes(
        data.medecins_notifies > 0
          ? `Demande publiée : ${data.medecins_notifies} médecin(s) prévenu(s). Suivez leurs réponses ici.`
          : "Demande publiée. Aucun médecin n'est encore inscrit pour ces critères : elle reste visible jusqu'à l'heure choisie."
      );
      navigate('/portail/patient-demandes');
    } catch (err) {
      // Si l'inscription a réussi mais la publication échoue (ex. heure trop
      // proche), le compte est créé et connecté : le visiteur corrige et
      // republie sans ressaisir ses informations.
      setErreur(err?.message || 'La publication de la demande a échoué. Veuillez réessayer.');
    } finally {
      setEnvoi(false);
    }
  };

  const apresConnexion = (data) => {
    setConnexionOuverte(false);
    const role = data?.utilisateur?.role;
    if (role && role !== 'patient') {
      toast.erreur(`Ce compte (« ${role} ») ne peut pas faire de demande : connectez-vous avec un compte patient.`);
    } else {
      toast.succes('Vous êtes connecté : votre demande sera publiée avec ce compte.');
    }
  };

  return (
    <>
      <div className="container-aps" style={{ paddingTop: '1.1rem', fontSize: '.82rem' }}>
        <Link to="/" className="text-muted-soft">Accueil</Link>
        <i className="fa-solid fa-chevron-right text-faint mx-1" style={{ fontSize: '.6rem' }} />
        <Link to="/medecin" className="text-muted-soft">Médecins</Link>
        <i className="fa-solid fa-chevron-right text-faint mx-1" style={{ fontSize: '.6rem' }} />
        <span className="text-faint">Demande rapide</span>
      </div>

      <section style={{ padding: '1.5rem 0 3rem' }}>
        <div className="container-aps" style={{ maxWidth: 860 }}>
          <span className="eyebrow">Demande rapide</span>
          <h1 style={{ fontSize: '1.8rem', marginTop: '.5rem' }}>Trouvez un médecin disponible à l&apos;heure de votre choix</h1>
          <p className="mt-2 mb-4">
            Indiquez la spécialité, la ville, le jour et l&apos;heure. Les médecins disponibles vous répondent avec
            leur tarif ; vous comparez leurs profils et validez celui qui vous convient, puis vous payez pour
            confirmer.
          </p>

          {autreRole && (
            <div className="info-card mb-3 d-flex align-items-center gap-3 flex-wrap">
              <i className="fa-solid fa-circle-info" style={{ color: 'var(--primary)' }} />
              <div className="flex-grow-1">
                Vous êtes connecté avec un compte « {user.role} ». La demande rapide est réservée aux patients.
              </div>
              <button type="button" className="btn btn-outline-primary btn-sm-aps" onClick={() => deconnecter()}>
                <i className="fa-solid fa-right-from-bracket" /> Se déconnecter
              </button>
            </div>
          )}

          <form onSubmit={publier}>
            {/* ---------------------------- Besoin ---------------------------- */}
            <div className="info-card mb-3">
              <h3><i className="fa-solid fa-bullhorn" /> Votre besoin</h3>
              <div className="row g-3 mt-1">
                <div className="col-md-6">
                  <label className="form-label-aps" htmlFor="dr-specialite">Spécialité</label>
                  <select id="dr-specialite" className="form-select" required value={besoin.specialite_id} onChange={majBesoin('specialite_id')}>
                    <option value="">Choisir…</option>
                    {specialites.map((s) => (
                      <option key={s.specialite_id} value={s.specialite_id}>{s.nom}</option>
                    ))}
                  </select>
                </div>
                <div className="col-md-3">
                  <label className="form-label-aps" htmlFor="dr-pays">Pays</label>
                  <select
                    id="dr-pays"
                    className="form-select"
                    required
                    value={paysId}
                    onChange={(e) => setBesoin((b) => ({ ...b, pays_id: e.target.value, ville_id: '' }))}
                  >
                    {!paysId && <option value="">Choisir…</option>}
                    {listePays.map((p) => (
                      <option key={p.pays_id} value={p.pays_id}>{p.nom}</option>
                    ))}
                  </select>
                </div>
                <div className="col-md-3">
                  <label className="form-label-aps" htmlFor="dr-ville">Ville</label>
                  <select id="dr-ville" className="form-select" required value={besoin.ville_id} onChange={majBesoin('ville_id')}>
                    <option value="">Choisir…</option>
                    {villes.map((v) => (
                      <option key={v.ville_id} value={v.ville_id}>{v.nom}</option>
                    ))}
                  </select>
                </div>
                <div className="col-md-4">
                  <label className="form-label-aps" htmlFor="dr-jour">Jour</label>
                  <input id="dr-jour" type="date" className="form-control" required min={jourLocal()} value={besoin.jour} onChange={majBesoin('jour')} />
                </div>
                <div className="col-md-4">
                  <label className="form-label-aps" htmlFor="dr-heure">
                    Heure{villeNom ? ` (heure de ${villeNom})` : ''}
                  </label>
                  <input id="dr-heure" type="time" step="900" className="form-control" required value={besoin.heure} onChange={majBesoin('heure')} />
                </div>
                <div className="col-md-4">
                  <span className="form-label-aps d-block">Type</span>
                  <div className="view-toggle w-100">
                    {TYPES_RDV.map((t) => (
                      <button
                        key={t.valeur}
                        type="button"
                        className={besoin.type_rdv === t.valeur ? 'active' : ''}
                        onClick={() => setBesoin((b) => ({ ...b, type_rdv: t.valeur }))}
                      >
                        <i className={`fa-solid ${t.icone}`} /> {t.libelle}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="col-12">
                  <label className="form-label-aps" htmlFor="dr-motif">Motif (facultatif)</label>
                  <textarea
                    id="dr-motif"
                    className="form-control"
                    rows={2}
                    maxLength={1000}
                    placeholder="Ex. fièvre depuis deux jours"
                    value={besoin.motif}
                    onChange={majBesoin('motif')}
                  />
                  <div className="text-faint" style={{ fontSize: '.75rem' }}>
                    Visible par les médecins de la spécialité, sans votre nom.
                  </div>
                </div>
              </div>
            </div>

            {/* ---------------------------- Compte ---------------------------- */}
            {status === 'loading' ? (
              <div className="info-card mb-3">
                <p className="text-faint mb-0" style={{ fontSize: '.85rem' }}>Vérification de votre session…</p>
              </div>
            ) : estPatient ? (
              <div className="info-card mb-3">
                <h3><i className="fa-solid fa-user" /> Vos informations</h3>
                <p className="text-faint" style={{ fontSize: '.82rem' }}>La demande sera publiée avec votre compte connecté.</p>
                <div className="row">
                  <div className="col-md-4 mb-2">
                    <div className="form-label-aps">Nom complet</div>
                    <div>{`${user?.prenom ?? ''} ${user?.nom ?? ''}`.trim() || '—'}</div>
                  </div>
                  <div className="col-md-4 mb-2">
                    <div className="form-label-aps">E-mail</div>
                    <div>{user?.email || '—'}</div>
                  </div>
                  <div className="col-md-4 mb-2">
                    <div className="form-label-aps">Téléphone</div>
                    <div>{user?.telephone || '—'}</div>
                  </div>
                </div>
                <button type="button" className="btn btn-ghost btn-sm-aps px-0" onClick={() => deconnecter()}>
                  Ce n&apos;est pas vous ? Se déconnecter
                </button>
              </div>
            ) : !autreRole && (
              <div className="info-card mb-3">
                <div className="d-flex justify-content-between align-items-start gap-2 flex-wrap">
                  <div>
                    <h3><i className="fa-solid fa-user-plus" /> Créez votre compte patient</h3>
                    <p className="text-faint" style={{ fontSize: '.82rem' }}>
                      Il servira à suivre les réponses des médecins, valider celui de votre choix et payer.
                    </p>
                  </div>
                  <button type="button" className="btn btn-outline-primary btn-sm-aps" onClick={() => setConnexionOuverte(true)}>
                    <i className="fa-solid fa-right-to-bracket" /> J&apos;ai déjà un compte
                  </button>
                </div>
                <div className="row">
                  <div className="col-md-6 mb-3">
                    <label className="form-label-aps" htmlFor="dr-prenom">Prénom</label>
                    <input id="dr-prenom" type="text" className="form-control" required value={insc.prenom} onChange={majInsc('prenom')} />
                  </div>
                  <div className="col-md-6 mb-3">
                    <label className="form-label-aps" htmlFor="dr-nom">Nom</label>
                    <input id="dr-nom" type="text" className="form-control" required value={insc.nom} onChange={majInsc('nom')} />
                  </div>
                  <div className="col-md-6 mb-3">
                    <label className="form-label-aps" htmlFor="dr-email">E-mail</label>
                    <input id="dr-email" type="email" className="form-control" required autoComplete="email" value={insc.email} onChange={majInsc('email')} />
                  </div>
                  <div className="col-md-6 mb-3">
                    <label className="form-label-aps" htmlFor="dr-telephone">Téléphone (facultatif)</label>
                    <input id="dr-telephone" type="tel" className="form-control" value={insc.telephone} onChange={majInsc('telephone')} />
                  </div>
                  <div className="col-md-4 mb-3">
                    <label className="form-label-aps" htmlFor="dr-mdp">Mot de passe</label>
                    <input
                      id="dr-mdp"
                      type="password"
                      className="form-control"
                      required
                      minLength={8}
                      autoComplete="new-password"
                      value={insc.mot_de_passe}
                      onChange={majInsc('mot_de_passe')}
                    />
                  </div>
                  <div className="col-md-4 mb-3">
                    <label className="form-label-aps" htmlFor="dr-naissance">Date de naissance</label>
                    <input
                      id="dr-naissance"
                      type="date"
                      className="form-control"
                      required
                      max={jourLocal()}
                      value={insc.date_naissance}
                      onChange={majInsc('date_naissance')}
                    />
                  </div>
                  <div className="col-md-4 mb-3">
                    <label className="form-label-aps" htmlFor="dr-pays-residence">Pays de résidence</label>
                    <select
                      id="dr-pays-residence"
                      className="form-select"
                      required
                      value={insc.pays_id || paysId}
                      onChange={majInsc('pays_id')}
                    >
                      {!(insc.pays_id || paysId) && <option value="">Choisir…</option>}
                      {listePays.map((p) => (
                        <option key={p.pays_id} value={p.pays_id}>{p.nom}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )}

            {erreur && (
              <div className="alert alert-danger d-flex align-items-center gap-2" role="alert">
                <i className="fa-solid fa-circle-exclamation" />
                <div>{erreur}</div>
              </div>
            )}

            <div className="d-flex justify-content-end">
              <button type="submit" className="btn btn-primary" disabled={envoi || autreRole || status === 'loading'}>
                {envoi ? (
                  <><i className="fa-solid fa-spinner fa-spin" /> Publication…</>
                ) : (
                  <><i className="fa-solid fa-paper-plane" /> {isAuthenticated ? 'Publier ma demande' : 'Créer mon compte et publier'}</>
                )}
              </button>
            </div>
          </form>
        </div>
      </section>

      {connexionOuverte && (
        <ConnexionModale
          titre="Connectez-vous à votre compte patient"
          sousTitre="Votre demande sera publiée avec ce compte, sans rien ressaisir."
          onFermer={() => setConnexionOuverte(false)}
          onConnecte={apresConnexion}
        />
      )}
    </>
  );
}
