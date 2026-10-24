// presence-messages.jsx — portails pharmacie et centre de santé, « Messages ».
//
// Messages reçus par le formulaire de contact de la fiche publique
// (disponible quand l'abonnement inclut le contact direct). L'agent les lit
// (ouverture = « lu »), répond par e-mail ou par téléphone avec ses propres
// outils, puis les archive. ApSa ne transmet pas de réponse à sa place.
import { useCallback, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useToast } from '../../feedback';
import { PresencePortailPage } from '../layouts/presence.portail-sidebar';
import { changerStatutMessage, listerMessagesGestion } from '../../../services/espacePresenceService';
import { BandeauMasque, EtatChargement } from './presenceCommun';
import { dateHeure, useRessource } from './presenceOutils';

const ONGLETS = [
  { cle: '', label: 'Boîte de réception' },
  { cle: 'non_lu', label: 'Non lus' },
  { cle: 'archive', label: 'Archivés' },
];

function Message({ m, nomFiche, onStatut }) {
  const [ouvert, setOuvert] = useState(false);
  const basculer = () => {
    setOuvert((v) => !v);
    if (!ouvert && m.statut === 'non_lu') onStatut(m, 'lu');
  };
  const sujet = encodeURIComponent(`Réponse de ${nomFiche} à votre message`);
  const citation = encodeURIComponent(`\n\n---\nVotre message du ${dateHeure(m.date_creation)} :\n${m.contenu}`);

  return (
    <div className={`py-3 border-bottom ${m.statut === 'non_lu' ? 'fw-semibold' : ''}`}>
      <button type="button" className="btn btn-link p-0 text-reset text-decoration-none w-100 text-start" onClick={basculer} aria-expanded={ouvert}>
        <div className="d-flex justify-content-between align-items-center gap-2">
          <span className="text-truncate">
            {m.statut === 'non_lu' && <i className="fa-solid fa-circle text-primary me-2" style={{ fontSize: '.5rem' }} />}
            {m.nom || m.email}
            {m.compte_aps && <span className="chip chip-complet ms-2" title="Envoyé depuis un compte ApSa connecté">Compte ApSa</span>}
          </span>
          <span className="text-faint small flex-shrink-0">{dateHeure(m.date_creation)}</span>
        </div>
        {!ouvert && <div className="small text-faint text-truncate fw-normal">{m.contenu}</div>}
      </button>
      {ouvert && (
        <div className="mt-2 fw-normal">
          <p style={{ whiteSpace: 'pre-line' }} className="mb-2">{m.contenu}</p>
          <div className="practitioner-meta mb-2">
            <span><i className="fa-solid fa-envelope" /> {m.email}</span>
            {m.telephone && <span><i className="fa-solid fa-phone" /> {m.telephone}</span>}
          </div>
          <div className="d-flex flex-wrap gap-2">
            <a className="btn btn-primary btn-sm-aps" href={`mailto:${m.email}?subject=${sujet}&body=${citation}`}>
              <i className="fa-solid fa-reply" /> Répondre par e-mail
            </a>
            {m.telephone && <a className="btn btn-outline-primary btn-sm-aps" href={`tel:${m.telephone}`}><i className="fa-solid fa-phone" /> Appeler</a>}
            {m.statut !== 'archive' ? (
              <button type="button" className="btn btn-ghost btn-sm-aps" onClick={() => onStatut(m, 'archive')}><i className="fa-solid fa-box-archive" /> Archiver</button>
            ) : (
              <button type="button" className="btn btn-ghost btn-sm-aps" onClick={() => onStatut(m, 'lu')}><i className="fa-solid fa-inbox" /> Remettre dans la boîte</button>
            )}
            {m.statut !== 'non_lu' && (
              <button type="button" className="btn btn-ghost btn-sm-aps" onClick={() => onStatut(m, 'non_lu')}><i className="fa-solid fa-envelope" /> Marquer non lu</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function PresenceMessages() {
  const { type, acteurId, fiche, droits, rafraichirMessages } = useOutletContext();
  const toast = useToast();
  const [onglet, setOnglet] = useState('');
  const charger = useCallback(() => listerMessagesGestion(type, acteurId, onglet || undefined), [type, acteurId, onglet]);
  const etat = useRessource(charger);
  const d = etat.donnees;

  const changerStatut = async (m, statut) => {
    try {
      await changerStatutMessage(m.message_id, statut);
      if (statut === 'archive') toast.succes('Message archivé.');
      etat.recharger();
      rafraichirMessages();
    } catch (err) {
      toast.erreur(err?.message || 'Modification impossible.');
    }
  };

  return (
    <PresencePortailPage titre="Messages" description="Les messages envoyés par les visiteurs depuis votre fiche publique.">
      <div className="d-flex flex-column gap-4">
        <BandeauMasque type={type} visible={droits.contact_direct}>
          Le formulaire de contact de votre fiche est fermé : votre abonnement actuel n&apos;inclut pas le contact direct. Les messages déjà reçus restent consultables.
        </BandeauMasque>
        <div className="info-card">
          <div className="aps-tabs aps-tabs-compact mb-3" role="tablist" aria-label="Filtrer les messages">
            {ONGLETS.map((o) => (
              <button key={o.cle} type="button" role="tab" aria-selected={onglet === o.cle} className={onglet === o.cle ? 'active' : ''} onClick={() => setOnglet(o.cle)}>
                {o.label}
                {d && o.cle !== '' && d.compteurs[o.cle] > 0 ? ` (${d.compteurs[o.cle]})` : ''}
              </button>
            ))}
          </div>
          <EtatChargement {...etat}>
            {d && (d.messages.length === 0 ? (
              <div className="aps-empty-state"><i className="fa-regular fa-envelope-open"></i><div>Aucun message ici.</div></div>
            ) : d.messages.map((m) => <Message key={m.message_id} m={m} nomFiche={fiche.nom} onStatut={changerStatut} />))}
          </EtatChargement>
          <p className="minimal-note mt-3 mb-0">
            <i className="fa-solid fa-shield-halved" /> Répondez depuis votre propre messagerie. N&apos;échangez jamais d&apos;informations médicales
            sensibles par e-mail sans l&apos;accord du patient.
          </p>
        </div>
      </div>
    </PresencePortailPage>
  );
}
