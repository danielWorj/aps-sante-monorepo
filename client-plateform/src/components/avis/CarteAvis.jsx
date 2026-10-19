// CarteAvis.jsx — un avis patient : auteur (« Prénom N. » ou « Patient
// vérifié »), note, critères, recommandation, commentaire, réponse du
// médecin. `actions` (facultatif) s'affiche en pied de carte (espace
// médecin : répondre, signaler) ; `children` remplace la réponse affichée
// (éditeur de réponse).
import { Etoiles } from './Etoiles';
import { initialesAuteur } from './auteur';
import { CRITERES_AVIS } from '../../services/reputationMedecinService';

const dateLongue = (iso) =>
  new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

function ilYA(iso) {
  const jours = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (jours < 1) return "aujourd'hui";
  if (jours < 2) return 'hier';
  if (jours < 30) return `il y a ${jours} jours`;
  const mois = Math.floor(jours / 30);
  if (mois < 12) return `il y a ${mois} mois`;
  const ans = Math.floor(mois / 12);
  return `il y a ${ans} an${ans > 1 ? 's' : ''}`;
}

/**
 * @param {{ avis: object, nomMedecin?: string, actions?: React.ReactNode,
 *   children?: React.ReactNode, signalement?: object|null }} props
 */
export default function CarteAvis({ avis, nomMedecin = 'Le médecin', actions, children, signalement }) {
  const initiales = initialesAuteur(avis.auteur);
  const criteres = CRITERES_AVIS.filter((c) => avis.criteres?.[c.cle]);

  return (
    <article className="carte-avis">
      <header className="carte-avis-entete">
        <div className={`carte-avis-avatar ${initiales ? '' : 'is-anonyme'}`} aria-hidden="true">
          {initiales ?? <i className="fa-solid fa-user-shield" />}
        </div>
        <div className="carte-avis-qui">
          <div className="carte-avis-nom">
            {avis.auteur}
            {avis.patient_verifie && (
              <span className="chip-verifie-patient" title="A consulté ce médecin via APS Santé">
                <i className="fa-solid fa-circle-check" /> Patient vérifié
              </span>
            )}
          </div>
          <div className="carte-avis-meta">
            <time dateTime={avis.date_creation} title={dateLongue(avis.date_creation)}>{ilYA(avis.date_creation)}</time>
            {avis.type_consultation && (
              <>
                {' · '}
                <i className={`fa-solid ${avis.type_consultation === 'teleconsultation' ? 'fa-video' : 'fa-house-medical'}`} />{' '}
                {avis.type_consultation === 'teleconsultation' ? 'Téléconsultation' : 'Au cabinet'}
              </>
            )}
          </div>
        </div>
        <div className="carte-avis-note">
          <Etoiles valeur={avis.note} taille="sm" />
          <strong>{avis.note}/5</strong>
        </div>
      </header>

      {avis.commentaire ? (
        <p className="carte-avis-texte">{avis.commentaire}</p>
      ) : (
        <p className="carte-avis-texte is-vide">Note sans commentaire.</p>
      )}

      {(criteres.length > 0 || avis.recommande !== null) && (
        <div className="carte-avis-criteres">
          {criteres.map((c) => (
            <span key={c.cle} className="critere-chip">
              <i className={`fa-solid ${c.icone}`} /> {c.libelle} <strong>{avis.criteres[c.cle]}/5</strong>
            </span>
          ))}
          {avis.recommande === true && (
            <span className="critere-chip is-reco"><i className="fa-solid fa-thumbs-up" /> Recommande</span>
          )}
          {avis.recommande === false && (
            <span className="critere-chip is-non-reco"><i className="fa-solid fa-thumbs-down" /> Ne recommande pas</span>
          )}
        </div>
      )}

      {signalement && (
        <div className="carte-avis-signalement">
          <i className="fa-solid fa-flag" /> Signalé le {dateLongue(signalement.date)} — en cours d&apos;examen par APS Santé.
        </div>
      )}

      {children ??
        (avis.reponse && (
          <div className="carte-avis-reponse">
            <div className="car-entete">
              <i className="fa-solid fa-reply" /> Réponse de {nomMedecin}
              <span> · {ilYA(avis.reponse.date)}</span>
            </div>
            <p>{avis.reponse.texte}</p>
          </div>
        ))}

      {actions && <footer className="carte-avis-actions">{actions}</footer>}
    </article>
  );
}
