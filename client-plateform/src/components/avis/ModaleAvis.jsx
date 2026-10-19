// ModaleAvis.jsx — le patient note une consultation terminée : note
// globale (obligatoire), critères, recommandation, commentaire, anonymat.
// POST /avis-medecin { rdv_id, ... } ; le serveur vérifie que le RDV est
// bien le sien, terminé, et pas encore noté. Réutilise .rdv-modal-*.
import { useEffect, useState } from 'react';
import { SaisieEtoiles } from './Etoiles';
import { COMMENTAIRE_AVIS_MAX, CRITERES_AVIS, deposerAvisMedecin } from '../../services/reputationMedecinService';

/**
 * @param {{ consultation: object, onClose: () => void, onDepose: (resultat: object) => void }} props
 *   consultation : { rdv_id, date_creneau, type_rdv, medecin: { utilisateur, specialite } }
 */
export default function ModaleAvis({ consultation, onClose, onDepose }) {
  const [note, setNote] = useState(null);
  const [criteres, setCriteres] = useState({});
  const [recommande, setRecommande] = useState(null);
  const [commentaire, setCommentaire] = useState('');
  const [anonyme, setAnonyme] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState(null);

  useEffect(() => {
    const onKeyDown = (e) => { if (e.key === 'Escape' && !enCours) onClose(); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [enCours, onClose]);

  const u = consultation.medecin?.utilisateur;
  const nomMedecin = `Dr ${[u?.prenom, u?.nom].filter(Boolean).join(' ')}`.trim();

  const soumettre = async (e) => {
    e.preventDefault();
    if (!note || enCours) return;
    setEnCours(true);
    setErreur(null);
    try {
      const donnees = { rdv_id: consultation.rdv_id, note, recommande, commentaire: commentaire.trim(), anonyme };
      CRITERES_AVIS.forEach((c) => { if (criteres[c.cle]) donnees[c.champ] = criteres[c.cle]; });
      onDepose(await deposerAvisMedecin(donnees));
    } catch (err) {
      setErreur(err?.message || "Impossible d'envoyer votre avis.");
    } finally {
      setEnCours(false);
    }
  };

  return (
    <div className="rdv-modal-overlay" onClick={enCours ? undefined : onClose}>
      <form
        className="rdv-modal modale-avis"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modale-avis-titre"
        onClick={(e) => e.stopPropagation()}
        onSubmit={soumettre}
      >
        <button type="button" className="rdv-modal-close" onClick={onClose} disabled={enCours} aria-label="Fermer">
          <i className="fa-solid fa-xmark" />
        </button>

        <h3 id="modale-avis-titre" style={{ paddingRight: '2rem' }}>Votre avis sur {nomMedecin}</h3>
        <p className="modale-avis-contexte">
          {consultation.medecin?.specialite?.nom && <>{consultation.medecin.specialite.nom} · </>}
          {consultation.type_rdv === 'teleconsultation' ? 'Téléconsultation' : 'Consultation au cabinet'} du{' '}
          {new Date(consultation.date_creneau).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
        </p>

        <fieldset className="modale-avis-bloc text-center">
          <legend className="modale-avis-legende">Note globale <span aria-hidden="true">*</span></legend>
          <SaisieEtoiles valeur={note} onChange={setNote} nom="note-globale" libelle="Note globale" />
        </fieldset>

        <fieldset className="modale-avis-bloc">
          <legend className="modale-avis-legende">En détail <span className="text-faint">(facultatif)</span></legend>
          {CRITERES_AVIS.map((c) => (
            <div key={c.cle} className="modale-avis-critere">
              <span><i className={`fa-solid ${c.icone}`} /> {c.libelle}</span>
              <SaisieEtoiles
                valeur={criteres[c.cle] ?? null}
                onChange={(n) => setCriteres((p) => ({ ...p, [c.cle]: n }))}
                nom={`critere-${c.cle}`}
                libelle={c.libelle}
                taille="md"
                afficherLibelle={false}
              />
            </div>
          ))}
        </fieldset>

        <fieldset className="modale-avis-bloc">
          <legend className="modale-avis-legende">Recommanderiez-vous ce médecin ?</legend>
          <div className="choix-reco" role="radiogroup" aria-label="Recommandation">
            {[
              { v: true, l: 'Oui', i: 'fa-thumbs-up' },
              { v: false, l: 'Non', i: 'fa-thumbs-down' },
            ].map((o) => (
              <button
                key={o.l}
                type="button"
                role="radio"
                aria-checked={recommande === o.v}
                className={`choix-reco-btn ${recommande === o.v ? 'is-actif' : ''}`}
                onClick={() => setRecommande(recommande === o.v ? null : o.v)}
              >
                <i className={`fa-solid ${o.i}`} /> {o.l}
              </button>
            ))}
          </div>
        </fieldset>

        <label htmlFor="modale-avis-commentaire" className="form-label fw-semibold mb-1">
          Racontez votre expérience <span className="text-faint fw-normal">(facultatif)</span>
        </label>
        <textarea
          id="modale-avis-commentaire"
          className="form-control mb-1"
          rows={4}
          value={commentaire}
          onChange={(e) => setCommentaire(e.target.value)}
          maxLength={COMMENTAIRE_AVIS_MAX}
          placeholder="Accueil, écoute, explications… Évitez les informations médicales personnelles."
          disabled={enCours}
        />
        <div className="text-faint mb-3" style={{ fontSize: '.78rem' }}>{commentaire.length}/{COMMENTAIRE_AVIS_MAX}</div>

        <div className="form-check mb-3">
          <input className="form-check-input" type="checkbox" id="modale-avis-anonyme" checked={anonyme} onChange={(e) => setAnonyme(e.target.checked)} disabled={enCours} />
          <label className="form-check-label" htmlFor="modale-avis-anonyme">
            Publier sous « Patient vérifié » plutôt que mon prénom
          </label>
        </div>

        {erreur && (
          <div className="alert alert-danger py-2 mb-3" role="alert">
            <i className="fa-solid fa-circle-exclamation me-2" />{erreur}
          </div>
        )}

        <div className="d-flex gap-2 justify-content-between align-items-center flex-wrap">
          <span className="text-faint" style={{ fontSize: '.78rem' }}>
            <i className="fa-solid fa-shield-halved me-1" />Vérifié par APS Santé avant publication.
          </span>
          <div className="d-flex gap-2">
            <button type="button" className="btn btn-ghost btn-sm-aps" onClick={onClose} disabled={enCours}>Plus tard</button>
            <button type="submit" className="btn btn-primary btn-sm-aps" disabled={!note || enCours}>
              {enCours && <span className="spinner-border spinner-border-sm me-1" />}
              Publier mon avis
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
