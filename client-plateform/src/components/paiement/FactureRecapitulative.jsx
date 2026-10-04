// src/components/paiement/FactureRecapitulative.jsx
//
// Politique de fonds v2 — Facture récapitulative détaillée (card).
//
// Deux exports :
//   - <FactureRecapitulative facture={...} />  : affichage PUR d'une facture déjà
//     chargée (réponse de GET /paiement/rendez-vous/:id/facture) ;
//   - <FactureRdv rdvId agregateur? />         : charge la facture puis l'affiche
//     (avant paiement : `agregateur` obligatoire ; après paiement : omis).
//
// Aucun montant n'est calculé ici : le serveur renvoie les lignes et le total,
// déjà arrondis, dont la somme est exactement le montant débité. Le composant
// ne fait que les afficher (formule « base × taux = montant » incluse).
//
// Facture MINIMALE (transaction antérieure à la v2) : une seule ligne
// « Consultation » et le total débité, sans frais ni commission.
//
// « Télécharger » : impression native du navigateur (window.print()) ; la feuille
// @media print de FactureRecapitulative.css n'imprime QUE la card. Dans la boîte
// d'impression, choisir « Enregistrer au format PDF ». Aucune dépendance ajoutée.
import { useCallback, useEffect, useState } from 'react';
import { obtenirFacture } from '../../services/paiementService';
import { dateHeure, montantDevise } from '../../utils/fonds';
import './FactureRecapitulative.css';

const formatPourcent = (taux) =>
  `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(Number(taux) * 100)} %`;

const formatDate = (iso) =>
  iso
    ? new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
    : null;

/** Détail du calcul d'une ligne : « 10 000 FCFA × 2 % », éventuellement « + montant fixe ». */
function formule(ligne, devise) {
  const parts = [];
  if (ligne.taux != null && ligne.base != null) {
    parts.push(`${montantDevise(ligne.base, devise)} × ${formatPourcent(ligne.taux)}`);
  }
  if (ligne.montant_fixe != null) {
    parts.push(`${parts.length ? '+ ' : ''}${montantDevise(ligne.montant_fixe, devise)} fixe`);
  }
  return parts.join(' ');
}

export function FactureRecapitulative({ facture, telechargeable = true, compact = false }) {
  const imprimer = useCallback(() => {
    if (!facture) return;
    // Le titre du document devient le nom de fichier proposé à l'enregistrement en PDF.
    const titreInitial = document.title;
    const restaurer = () => {
      document.title = titreInitial;
      window.removeEventListener('afterprint', restaurer);
    };
    window.addEventListener('afterprint', restaurer);
    document.title = facture.numero ? `Facture ${facture.numero}` : 'Facture APS Santé';
    window.print();
  }, [facture]);

  if (!facture) return null;

  const { entete = {}, lignes = [], devise, total } = facture;
  const estDevis = facture.type === 'devis';
  const date = formatDate(facture.date);

  return (
    <article
      className={`facture-card${compact ? ' is-compact' : ''}`}
      aria-label={estDevis ? 'Aperçu de la facture' : 'Facture'}
    >
      <header className="facture-head">
        <div>
          <div className="facture-marque">APS Santé</div>
          <div className="facture-sous-titre">{estDevis ? 'Aperçu de la facture' : 'Facture'}</div>
        </div>
        <div className="facture-meta">
          {estDevis ? (
            <span className="facture-badge">Avant paiement</span>
          ) : (
            facture.numero && <strong>{facture.numero}</strong>
          )}
          {date && <span>{date}</span>}
        </div>
      </header>

      <section className="facture-consultation">
        <div className="facture-consultation-titre">Consultation auprès de {entete.medecin || 'votre médecin'}</div>
        <dl className="facture-infos">
          {entete.specialite && (<><dt>Spécialité</dt><dd>{entete.specialite}</dd></>)}
          {entete.pays && (<><dt>Pays</dt><dd>{entete.pays}</dd></>)}
          {entete.ville && (<><dt>Ville</dt><dd>{entete.ville}</dd></>)}
          {entete.date_creneau && (<><dt>Rendez-vous</dt><dd>{dateHeure(entete.date_creneau)}</dd></>)}
        </dl>
      </section>

      <ul className="facture-lignes">
        {lignes.map((l) => {
          const detail = formule(l, devise);
          return (
            <li key={l.code} className="facture-ligne">
              <span className="facture-ligne-libelle">
                {l.libelle}
                {detail && <small>{detail}</small>}
              </span>
              <span className="facture-ligne-montant">{montantDevise(l.montant, devise)}</span>
            </li>
          );
        })}
      </ul>

      <div className="facture-total">
        <span>Total</span>
        <strong>{montantDevise(total, devise)}</strong>
      </div>

      {facture.minimale && (
        <p className="facture-note">
          Ce paiement a été effectué avant la mise en place du détail des frais : seul le montant total
          débité est affiché.
        </p>
      )}

      {telechargeable && (
        <button type="button" className="btn btn-outline-primary facture-telecharger" onClick={imprimer}>
          <i className="fa-solid fa-download" /> Télécharger la facture
        </button>
      )}
    </article>
  );
}

/**
 * Charge puis affiche la facture d'un RDV.
 * @param {{ rdvId: string, agregateur?: 'stripe'|'campay', telechargeable?: boolean, compact?: boolean }} props
 */
export function FactureRdv({ rdvId, agregateur, telechargeable = true, compact = false }) {
  // etat : { cle, facture?, erreur? } — `cle` identifie la requête à laquelle il répond.
  const [etat, setEtat] = useState({ cle: null });
  const cle = `${rdvId}|${agregateur || ''}`;

  useEffect(() => {
    if (!rdvId) return undefined;
    let annule = false;
    obtenirFacture(rdvId, agregateur)
      .then((facture) => { if (!annule) setEtat({ cle, facture }); })
      .catch((err) => {
        if (!annule) setEtat({ cle, erreur: err?.message || 'Facture indisponible pour le moment.' });
      });
    return () => { annule = true; };
  }, [rdvId, agregateur, cle]);

  // Un état qui répond à une autre requête (changement d'agrégateur) = chargement.
  const courant = etat.cle === cle ? etat : null;

  if (!courant) {
    return (
      <div className="facture-etat">
        <span className="spinner-border spinner-border-sm" /> Chargement de la facture…
      </div>
    );
  }
  if (courant.erreur) {
    return (
      <div className="facture-etat is-erreur">
        <i className="fa-solid fa-circle-exclamation" /> {courant.erreur}
      </div>
    );
  }
  return <FactureRecapitulative facture={courant.facture} telechargeable={telechargeable} compact={compact} />;
}

export default FactureRecapitulative;