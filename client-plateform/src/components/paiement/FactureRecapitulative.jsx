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
// @media print de FactureRecapitulative.css n'imprime QUE la copie montée sous <body>. Dans la boîte
// d'impression, choisir « Enregistrer au format PDF ». Aucune dépendance ajoutée.
import { useEffect, useState, Fragment } from 'react';
import { createPortal } from 'react-dom';
import { obtenirFacture } from '../../services/paiementService';
import { dateHeure, montantDevise } from '../../utils/fonds';
import './FactureRecapitulative.css';

const formatPourcent = (taux) =>
  `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(Number(taux) * 100)} %`;

const formatDate = (iso) =>
  iso
    ? new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
    : null;

/** date_fin d'un abonnement est EXCLUSIVE : dernier jour couvert = veille. */
const finInclusive = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString();
};

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

/** Contenu de la facture (sans bouton) : partagé entre la card affichée et la copie imprimée. */
function FactureCorps({ facture, compact = false, className = '' }) {
  const { entete = {}, lignes = [], devise, total } = facture;
  const estDevis = facture.type === 'devis';
  const date = formatDate(facture.date);

  return (
    <article
      className={`facture-card${compact ? ' is-compact' : ''}${className ? ` ${className}` : ''}`}
      aria-label={estDevis ? 'Aperçu de la facture' : 'Facture'}
    >
      <header className="facture-head">
        <div>
          <div className="facture-marque">APSA</div>
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

      {entete.souscripteur ? (
        // Abonnement de présence (pharmacie, centre de santé, médecin).
        <section className="facture-consultation">
          <div className="facture-consultation-titre">Abonnement de présence — {entete.souscripteur}</div>
          <dl className="facture-infos">
            {entete.type_acteur_libelle && (<><dt>Fiche</dt><dd>{entete.type_acteur_libelle}</dd></>)}
            {entete.niveau?.libelle && (<><dt>Niveau</dt><dd>{entete.niveau.libelle}</dd></>)}
            {entete.duree_mois && (<><dt>Durée</dt><dd>{entete.duree_mois} mois</dd></>)}
            {facture.periode?.debut && (
              <><dt>Période</dt><dd>du {formatDate(facture.periode.debut)} au {formatDate(finInclusive(facture.periode.fin_exclusive))}</dd></>
            )}
          </dl>
        </section>
      ) : entete.assurance ? (
        // Abonnement assurance (devis ou facture archivée — guide abonnements v3, §1.5.9).
        <section className="facture-consultation">
          <div className="facture-consultation-titre">Abonnement de {entete.assurance}</div>
          <dl className="facture-infos">
            {entete.niveau?.libelle && (<><dt>Niveau</dt><dd>{entete.niveau.libelle}</dd></>)}
            {entete.duree_mois && (<><dt>Durée</dt><dd>{entete.duree_mois} mois</dd></>)}
            {facture.periode?.debut && (
              <><dt>Période</dt><dd>du {formatDate(facture.periode.debut)} au {formatDate(finInclusive(facture.periode.fin_exclusive))}</dd></>
            )}
          </dl>
        </section>
      ) : (
        <section className="facture-consultation">
          <div className="facture-consultation-titre">Consultation auprès de {entete.medecin || 'votre médecin'}</div>
          <dl className="facture-infos">
            {entete.specialite && (<><dt>Spécialité</dt><dd>{entete.specialite}</dd></>)}
            {entete.pays && (<><dt>Pays</dt><dd>{entete.pays}</dd></>)}
            {entete.ville && (<><dt>Ville</dt><dd>{entete.ville}</dd></>)}
            {entete.date_creneau && (<><dt>Rendez-vous</dt><dd>{dateHeure(entete.date_creneau)}</dd></>)}
          </dl>
        </section>
      )}

      <ul className="facture-lignes">
        {lignes.map((l) => {
          const detail = formule(l, devise);
          return (
            <Fragment key={l.code}>
              {/* Abonnements : sous-total après réduction, avant les frais d'agrégateur. */}
              {l.code === 'frais_agregateur' && facture.sous_total != null && (
                <li className="facture-ligne facture-sous-total">
                  <span className="facture-ligne-libelle">Sous-total après réduction</span>
                  <span className="facture-ligne-montant">{montantDevise(facture.sous_total, devise)}</span>
                </li>
              )}
              <li className="facture-ligne">
                <span className="facture-ligne-libelle">
                  {l.libelle}
                  {detail && <small>{detail}</small>}
                </span>
                <span className="facture-ligne-montant">{montantDevise(l.montant, devise)}</span>
              </li>
            </Fragment>
          );
        })}
      </ul>

      <div className="facture-total">
        <span>Total</span>
        <strong>{montantDevise(total, devise)}</strong>
      </div>

      {facture.frais_operateur && (
        <p className="facture-note">
          {facture.frais_operateur.mention} : environ {montantDevise(facture.frais_operateur.montant, devise)},
          prélevés par l&apos;opérateur au moment du paiement.
        </p>
      )}

      {facture.minimale && (
        <p className="facture-note">
          Ce paiement a été effectué avant la mise en place du détail des frais : seul le montant total
          débité est affiché.
        </p>
      )}
    </article>
  );
}

export function FactureRecapitulative({ facture, telechargeable = true, compact = false }) {
  // `impression` : monte, le temps de l'impression, une copie de la facture directement
  // sous <body> (portail). Le CSS d'impression masque alors tout le reste en display:none,
  // si bien que la page imprimée ne contient QUE la facture (1 seule page).
  const [impression, setImpression] = useState(false);

  useEffect(() => {
    if (!impression) return undefined;
    // Le titre du document devient le nom de fichier proposé à l'enregistrement en PDF.
    const titreInitial = document.title;
    document.title = facture?.numero ? `Facture ${facture.numero}` : 'Facture APSA';
    const terminer = () => {
      document.title = titreInitial;
      setImpression(false);
    };
    window.addEventListener('afterprint', terminer);
    // Laisse le portail se monter avant d'ouvrir la boîte d'impression.
    const id = requestAnimationFrame(() => window.print());
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener('afterprint', terminer);
      document.title = titreInitial;
    };
  }, [impression, facture]);

  if (!facture) return null;

  return (
    <>
      <FactureCorps facture={facture} compact={compact} className="facture-ecran" />
      {telechargeable && (
        <button type="button" className="btn btn-outline-primary facture-telecharger" onClick={() => setImpression(true)}>
          <i className="fa-solid fa-download" /> Télécharger la facture
        </button>
      )}
      {impression && createPortal(
        <div className="facture-print-root"><FactureCorps facture={facture} /></div>,
        document.body,
      )}
    </>
  );
}

/**
 * Charge puis affiche la facture d'un RDV.
 * @param {{ rdvId: string, agregateur?: 'stripe'|'campay', telechargeable?: boolean, compact?: boolean }} props
 */
export function FactureRdv({ rdvId, agregateur, telechargeable = true, compact = false }) {
  if (!rdvId) return null;
  return (
    <FactureChargee
      cle={`rdv:${rdvId}|${agregateur || ''}`}
      charger={() => obtenirFacture(rdvId, agregateur)}
      telechargeable={telechargeable}
      compact={compact}
    />
  );
}

/**
 * Charge puis affiche la facture (ou le devis) d'un objet payé via son
 * adaptateur (voir adaptateurs.jsx).
 * @param {{ adaptateur: object, agregateur?: string, telechargeable?: boolean, compact?: boolean }} props
 */
export function FactureAdaptateur({ adaptateur, agregateur, telechargeable = true, compact = false }) {
  return (
    <FactureChargee
      cle={`${adaptateur.cle}|${agregateur || ''}`}
      charger={() => adaptateur.obtenirFacture(agregateur)}
      telechargeable={telechargeable}
      compact={compact}
    />
  );
}

/**
 * @param {{ cle: string, charger: () => Promise<object>, telechargeable?: boolean, compact?: boolean }} props
 *   `cle` identifie la requête : un changement de cle relance le chargement.
 */
export function FactureChargee({ cle, charger, telechargeable = true, compact = false }) {
  // etat : { cle, facture?, erreur? } — `cle` identifie la requête à laquelle il répond.
  const [etat, setEtat] = useState({ cle: null });

  useEffect(() => {
    let annule = false;
    charger()
      .then((facture) => { if (!annule) setEtat({ cle, facture }); })
      .catch((err) => {
        if (!annule) setEtat({ cle, erreur: err?.message || 'Facture indisponible pour le moment.' });
      });
    return () => { annule = true; };
    // `charger` change à chaque rendu ; `cle` décrit seule la requête.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cle]);

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