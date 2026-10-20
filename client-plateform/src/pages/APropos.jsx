// src/pages/APropos.jsx
// Page publique « À propos » : positionnement d'ApSa, services, engagements
// et fonctionnement du paiement sécurisé. Contenu tiré du cahier des charges
// (v3), formulé pour le grand public ; mise en forme alignée sur l'accueil
// 2026 (primitives aps-*, styles dans info-2026.css).
import { Link } from 'react-router-dom';
import photoEquipe from '../assets/img/med5.jpg';
import photoParcours from '../assets/img/structure4.jpg';
import '../assets/styles/info-2026.css';

const CE_QUE_NOUS_NE_SOMMES_PAS = [
  {
    icone: 'fa-hospital',
    titre: "Pas un établissement de soins",
    texte: 'Les consultations sont assurées par des professionnels indépendants, vérifiés avant leur publication.',
  },
  {
    icone: 'fa-shield-halved',
    titre: 'Pas un assureur',
    texte: "Nous présentons les compagnies et leurs agences ; la souscription se fait directement auprès d'elles.",
  },
  {
    icone: 'fa-scale-unbalanced',
    titre: 'Pas un comparateur',
    texte: "Aucun classement de tarifs ni de produits : chaque acteur est présenté de façon factuelle.",
  },
];

const SERVICES = [
  { icone: 'fa-user-doctor', titre: 'Annuaire santé', texte: 'Médecins, cliniques, hôpitaux, laboratoires et centres d’imagerie, avec horaires et localisation.', lien: '/medecin' },
  { icone: 'fa-prescription-bottle-medical', titre: 'Pharmacies de garde', texte: 'Toutes les officines du pays et les gardes en cours, autour de vous.', lien: '/pharmacie', ton: 'is-sky' },
  { icone: 'fa-calendar-check', titre: 'Rendez-vous au cabinet', texte: 'Choisissez un créneau, recevez votre code de consultation et présentez-le le jour J.', lien: '/medecin' },
  { icone: 'fa-video', titre: 'Téléconsultation', texte: 'Consultez à distance, en vidéo ou en audio, et recevez votre ordonnance.', lien: '/medecin', ton: 'is-violet' },
  { icone: 'fa-bolt', titre: 'Demande express', texte: 'Une seule demande : les médecins disponibles à l’heure souhaitée vous répondent.', lien: '/demande-rapide', ton: 'is-amber' },
  { icone: 'fa-truck-medical', titre: 'Urgences', texte: 'Les numéros officiels de votre pays et les services les plus proches, en un geste.', lien: '/urgences', ton: 'is-red' },
  { icone: 'fa-umbrella', titre: 'Assurances santé', texte: 'Compagnies, courtiers, produits et réseau d’agences géolocalisées.', lien: '/assurance', ton: 'is-coral' },
  { icone: 'fa-building-shield', titre: 'Structures de santé', texte: 'Établissements publics et privés, spécialités disponibles et contacts.', lien: '/structure-sante' },
];

const ENGAGEMENTS = [
  {
    icone: 'fa-heart-pulse',
    titre: 'La santé publique avant tout',
    texte: "Les urgences et l'information vitale passent avant toute considération commerciale. Le module Urgences ne contient aucune publicité.",
  },
  {
    icone: 'fa-certificate',
    titre: 'Des professionnels vérifiés',
    texte: "L'inscription à l'Ordre des médecins et des pharmaciens est contrôlée avant la publication d'une fiche.",
  },
  {
    icone: 'fa-lock',
    titre: 'Un paiement protégé',
    texte: "Votre paiement est conservé en séquestre et n'est versé au professionnel qu'une fois la consultation confirmée.",
  },
  {
    icone: 'fa-receipt',
    titre: 'Des frais transparents',
    texte: "Avant de payer, vous voyez le détail : honoraires, frais de service ApSa, taxes et frais de paiement.",
  },
  {
    icone: 'fa-hand-holding-heart',
    titre: 'Gratuit pour les patients',
    texte: 'Rechercher, consulter une fiche, trouver une garde ou une urgence ne coûte rien. Seul le service réservé est payant.',
  },
  {
    icone: 'fa-user-shield',
    titre: 'Vos données protégées',
    texte: 'Échanges chiffrés, accès restreints et conservation limitée au strict nécessaire, selon les standards internationaux.',
  },
];

const ETAPES_PAIEMENT = [
  { titre: 'Vous réservez', texte: 'Créneau choisi, montant détaillé, paiement par Mobile Money ou carte bancaire.' },
  { titre: 'Le paiement est mis en séquestre', texte: 'La somme est conservée de façon sécurisée : le professionnel ne la reçoit pas encore.' },
  { titre: 'La consultation est confirmée', texte: 'Le jour du rendez-vous, le médecin saisit votre code de consultation.' },
  { titre: 'Le professionnel est payé', texte: "S'il ne vous reçoit pas, vous êtes remboursé intégralement, frais compris." },
];

const PUBLICS = [
  { icone: 'fa-user', titre: 'Patients', texte: 'Trouvez, réservez et payez en confiance.', lien: '/creer-patient', action: 'Créer un compte' },
  { icone: 'fa-stethoscope', titre: 'Médecins', texte: 'Fiche vérifiée, agenda, téléconsultation et portefeuille.', lien: '/devenir-medecin', action: 'Devenir médecin partenaire' },
  { icone: 'fa-house-medical', titre: 'Pharmacies & structures', texte: 'Horaires, gardes et présence enrichie de votre établissement.', lien: '/inscription', action: 'Référencer mon établissement' },
  { icone: 'fa-briefcase', titre: 'Assureurs & annonceurs', texte: 'Vitrine, réseau d’agences et emplacements publicitaires.', lien: '/publicite/reserver', action: 'Découvrir les offres' },
];

export default function APropos() {
  return (
    <div className="info26">
      {/* ─────────── Accroche ─────────── */}
      <section className="info26-hero">
        <div className="container-aps">
          <div className="info26-hero-grille">
          <div>
            <nav className="info26-fil" aria-label="Fil d'Ariane">
              <Link to="/home">Accueil</Link>
              <i className="fa-solid fa-chevron-right" />
              <span>À propos</span>
            </nav>
            <span className="aps-over">À propos d&apos;ApSa</span>
            <h1 className="aps-h1 info26-titre">
              Votre santé, vos assurances, <span className="info26-accent">un seul carnet d&apos;adresses</span>.
            </h1>
            <p className="aps-t-s info26-lead">
              ApSa (AZA Proxi Santé Assurances) rassemble en un même endroit les médecins, pharmacies, structures de
              santé, services d&apos;urgence et assureurs. Notre mission : réduire le temps entre un besoin de soin
              et l&apos;accès au soin, avec un paiement sécurisé à chaque étape.
            </p>
            <div className="info26-actions">
              <Link to="/medecin" className="btn btn-primary btn-lg-aps">
                <i className="fa-solid fa-magnifying-glass" /> Trouver un professionnel
              </Link>
              <Link to="/contact" className="btn btn-outline-primary btn-lg-aps">
                <i className="fa-regular fa-envelope" /> Nous contacter
              </Link>
            </div>
          </div>

          <div className="info26-hero-visuel" aria-hidden="true">
            <div className="info26-hero-photo" style={{ backgroundImage: `url(${photoEquipe})` }} />
            <div className="aps-card has-shadow aps-float info26-flot">
              <span className="aps-ic"><i className="fa-solid fa-earth-africa" /></span>
              <div>
                <div className="info26-flot-t">Un compte, plusieurs pays</div>
                <div className="aps-t-xs">Lancement au Cameroun · FR / EN</div>
              </div>
            </div>
          </div>
          </div>
        </div>

        <div className="container-aps">
          <ul className="info26-faits">
            <li><i className="fa-solid fa-mobile-screen-button" /> Web &amp; application mobile</li>
            <li><i className="fa-solid fa-language" /> Français et anglais</li>
            <li><i className="fa-solid fa-money-bill-wave" /> Mobile Money et carte bancaire</li>
            <li><i className="fa-solid fa-circle-check" /> Professionnels vérifiés à l&apos;Ordre</li>
          </ul>
        </div>
      </section>

      {/* ─────────── Positionnement ─────────── */}
      <section className="info26-sec">
        <div className="container-aps">
          <div className="info26-positionnement">
            <div>
              <span className="aps-over">Notre rôle</span>
              <h2 className="aps-h2 mt-2">Un annuaire de référence et un lieu de mise en relation.</h2>
              <p className="aps-t-s mt-3">
                ApSa ne remplace ni votre médecin, ni votre pharmacien, ni votre assureur. Nous vous aidons à les
                trouver, à les joindre, à prendre rendez-vous et à payer en toute sécurité — puis nous nous effaçons.
              </p>
            </div>
            <div className="info26-pas">
              {CE_QUE_NOUS_NE_SOMMES_PAS.map((p) => (
                <div className="info26-pas-item" key={p.titre}>
                  <span className="aps-ic is-sm"><i className={`fa-solid ${p.icone}`} /></span>
                  <div>
                    <h3 className="aps-h4">{p.titre}</h3>
                    <p className="aps-t-s mb-0">{p.texte}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ─────────── Services ─────────── */}
      <section className="info26-sec">
        <div className="container-aps">
          <div className="aps-sec-head">
            <div>
              <span className="aps-over">Ce que vous trouvez sur ApSa</span>
              <h2 className="aps-h2 mt-2">Tout le parcours de soin, au même endroit.</h2>
            </div>
            <p className="aps-t-s">Du premier renseignement à la consultation, chaque service est pensé pour le mobile et les connexions modestes.</p>
          </div>
          <div className="aps-grid-4">
            {SERVICES.map((s) => (
              <Link to={s.lien} className="aps-card info26-service" key={s.titre}>
                <span className={`aps-ic ${s.ton || ''}`}><i className={`fa-solid ${s.icone}`} /></span>
                <h3 className="aps-h4 mt-3">{s.titre}</h3>
                <p className="aps-t-s mb-0 mt-2">{s.texte}</p>
                <span className="aps-lnk mt-3">Découvrir <i className="fa-solid fa-arrow-right" /></span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ─────────── Paiement sécurisé ─────────── */}
      <section className="info26-sec">
        <div className="container-aps info26-paiement">
          <div className="info26-paiement-photo" style={{ backgroundImage: `url(${photoParcours})` }} aria-hidden="true">
            <div className="aps-card has-shadow info26-sequestre">
              <span className="aps-pill"><i className="fa-solid fa-lock" /> Paiement en séquestre</span>
              <p className="aps-t-xs mt-2 mb-0">Versé au médecin seulement après la consultation.</p>
            </div>
          </div>
          <div>
            <span className="aps-over">Paiement sécurisé</span>
            <h2 className="aps-h2 mt-2">Vous payez en confiance, le médecin est payé rapidement.</h2>
            <ol className="info26-etapes">
              {ETAPES_PAIEMENT.map((e, i) => (
                <li key={e.titre}>
                  <span className={`info26-etape-num ${i === ETAPES_PAIEMENT.length - 1 ? 'is-on' : ''}`}>{i + 1}</span>
                  <div>
                    <h3 className="aps-h4">{e.titre}</h3>
                    <p className="aps-t-s mb-0 mt-1">{e.texte}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* ─────────── Engagements ─────────── */}
      <section className="info26-sec">
        <div className="container-aps">
          <div className="aps-sec-head">
            <div>
              <span className="aps-over">Nos engagements</span>
              <h2 className="aps-h2 mt-2">La confiance, d&apos;abord.</h2>
            </div>
            <p className="aps-t-s">Six principes qui guident chaque fonctionnalité de la plateforme.</p>
          </div>
          <div className="aps-grid-3">
            {ENGAGEMENTS.map((e) => (
              <div className="aps-card info26-engagement" key={e.titre}>
                <span className="aps-ic"><i className={`fa-solid ${e.icone}`} /></span>
                <h3 className="aps-h4 mt-3">{e.titre}</h3>
                <p className="aps-t-s mb-0 mt-2">{e.texte}</p>
              </div>
            ))}
          </div>
          <div className="aps-note mt-4">
            <i className="fa-solid fa-circle-info" />
            <span>
              Visibilité et publicité sont strictement séparées : un abonnement enrichit une fiche sans jamais modifier
              le classement, et les contenus sponsorisés sont toujours signalés comme tels.
            </span>
          </div>
        </div>
      </section>

      {/* ─────────── Pour qui ─────────── */}
      <section className="info26-sec">
        <div className="container-aps">
          <div className="aps-sec-head">
            <div>
              <span className="aps-over">Rejoindre ApSa</span>
              <h2 className="aps-h2 mt-2">Une plateforme, quatre façons d&apos;y participer.</h2>
            </div>
          </div>
          <div className="aps-grid-4">
            {PUBLICS.map((p) => (
              <div className="aps-card info26-public" key={p.titre}>
                <span className="aps-ic is-sm"><i className={`fa-solid ${p.icone}`} /></span>
                <h3 className="aps-h4 mt-3">{p.titre}</h3>
                <p className="aps-t-s mt-2">{p.texte}</p>
                <Link to={p.lien} className="aps-lnk">{p.action} <i className="fa-solid fa-arrow-right" /></Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─────────── Appel à l'action ─────────── */}
      <section className="info26-sec info26-sec-fin">
        <div className="container-aps">
          <div className="info26-cta">
            <div>
              <h2 className="aps-h2">Une question, un partenariat, une suggestion ?</h2>
              <p className="info26-cta-txt">Notre équipe vous répond sous 48 heures ouvrées.</p>
            </div>
            <div className="info26-cta-actions">
              <Link to="/contact" className="btn btn-light btn-lg-aps">
                <i className="fa-regular fa-envelope" /> Contactez-nous
              </Link>
              <Link to="/urgences" className="info26-cta-urgence">
                <i className="fa-solid fa-truck-medical" /> Une urgence ? Numéros officiels
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
