// notifications-bell.jsx
//
// Cloche de notifications in-app (politique de fonds v2, point E). Interrogation
// toutes les 60 s, en pause quand l'onglet est masqué. Un clic marque la
// notification lue puis mène à la page des rendez-vous.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  listerNotifications, marquerNotificationLue, marquerToutesLues,
} from '../../../services/fondsService';

const INTERVALLE_MS = 60000;
const ICONES = {
  rdv_a_reprogrammer: 'fa-calendar-xmark',
  rdv_reprogrammation_proposee: 'fa-calendar-plus',
  rdv_reprogrammation_acceptee: 'fa-calendar-check',
  // D8 : le médecin n'est notifié qu'à la confirmation du paiement (cree -> confirme).
  rdv_paye: 'fa-circle-check',
  // RDV physique accepté par le médecin (ou lieu modifié) : le patient reçoit date + lieu.
  rdv_accepte: 'fa-location-dot',
  // Abonnement de présence du médecin : activation, rappel d'échéance.
  abonnement_presence_active: 'fa-id-card-clip',
  abonnement_presence_echeance: 'fa-hourglass-half',
  // RDV aléatoire : nouvelle demande (médecin), réponse d'un médecin, demande expirée (patient).
  offre_rdv_nouvelle: 'fa-bullhorn',
  offre_rdv_reponse: 'fa-user-doctor',
  offre_rdv_expiree: 'fa-hourglass-end',
  // Portail assurance : nouvelle demande de mise en relation, abonnement de la fiche.
  mise_en_relation_recue: 'fa-inbox',
  abonnement_assurance_active: 'fa-id-card',
  abonnement_assurance_echeance: 'fa-hourglass-half',
};
// Date du créneau (ISO dans `donnees`), affichée dans le fuseau du navigateur.
const dateRdv = (iso) => new Date(iso).toLocaleString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
const heure = (iso) => new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

/** @param {{ cheminRdv: string }} props  page cible au clic (portail médecin ou patient) */
export default function NotificationsBell({ cheminRdv }) {
  const navigate = useNavigate();
  const racine = useRef(null);
  const [ouvert, setOuvert] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [nonLues, setNonLues] = useState(0);

  const charger = useCallback(async () => {
    try {
      const d = await listerNotifications({ limit: 30 });
      setNotifications(d.notifications || []);
      setNonLues(d.non_lues || 0);
    } catch { /* silencieux : une panne de notifications ne doit jamais gêner le portail */ }
  }, []);

  useEffect(() => {
    charger();
    const id = setInterval(() => { if (!document.hidden) charger(); }, INTERVALLE_MS);
    return () => clearInterval(id);
  }, [charger]);

  useEffect(() => {
    if (!ouvert) return undefined;
    const dehors = (e) => { if (racine.current && !racine.current.contains(e.target)) setOuvert(false); };
    document.addEventListener('mousedown', dehors);
    return () => document.removeEventListener('mousedown', dehors);
  }, [ouvert]);

  const ouvrirNotification = async (n) => {
    setOuvert(false);
    if (!n.lue_le) {
      setNotifications((p) => p.map((x) => (x.notification_id === n.notification_id ? { ...x, lue_le: new Date().toISOString() } : x)));
      setNonLues((c) => Math.max(0, c - 1));
      try { await marquerNotificationLue(n.notification_id); } catch { /* idempotent, rechargé au prochain cycle */ }
    }
    // Une notification peut porter sa propre page (ex. abonnement de présence).
    const lien = n.donnees?.lien;
    navigate(typeof lien === 'string' && lien.startsWith('/') && !lien.startsWith('//') ? lien : cheminRdv);
  };

  const toutLire = async () => {
    try { await marquerToutesLues(); await charger(); } catch { /* ignoré */ }
  };

  return (
    <div className="position-relative" ref={racine}>
      <button type="button" className="btn btn-ghost btn-sm-aps btn-icon position-relative" aria-label={`Notifications${nonLues ? ` (${nonLues} non lues)` : ''}`}
        aria-expanded={ouvert} onClick={() => setOuvert((v) => !v)}>
        <i className="fa-solid fa-bell"></i>
        {nonLues > 0 && (
          <span className="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger">{nonLues > 9 ? '9+' : nonLues}</span>
        )}
      </button>

      {ouvert && (
        <div className="position-absolute end-0 mt-2 bg-white border rounded shadow" style={{ width: 340, maxWidth: '90vw', zIndex: 1050 }}>
          <div className="d-flex justify-content-between align-items-center px-3 py-2 border-bottom">
            <strong>Notifications</strong>
            {nonLues > 0 && <button type="button" className="btn btn-link btn-sm p-0" onClick={toutLire}>Tout marquer comme lu</button>}
          </div>
          <ul className="list-unstyled mb-0" style={{ maxHeight: 360, overflowY: 'auto' }}>
            {notifications.length === 0 && <li className="px-3 py-3 text-muted small">Aucune notification.</li>}
            {notifications.map((n) => (
              <li key={n.notification_id}>
                <button type="button" onClick={() => ouvrirNotification(n)}
                  className={`w-100 text-start border-0 bg-transparent px-3 py-2 d-flex gap-2 ${n.lue_le ? '' : 'fw-semibold'}`}>
                  <i className={`fa-solid ${ICONES[n.type] || 'fa-bell'} mt-1`}></i>
                  <span>
                    <span className="d-block">{n.titre}</span>
                    <span className="d-block small text-muted fw-normal">{n.message}</span>
                    {n.donnees?.date_creneau && (
                      <span className="d-block small fw-normal">
                        <i className="fa-regular fa-calendar me-1"></i>Rendez-vous le {dateRdv(n.donnees.date_creneau)}
                      </span>
                    )}
                    {n.donnees?.date_souhaitee && (
                      <span className="d-block small fw-normal">
                        <i className="fa-regular fa-calendar me-1"></i>Demande pour le {dateRdv(n.donnees.date_souhaitee)}
                      </span>
                    )}
                    <span className="d-block small text-muted fw-normal">{heure(n.date_creation)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}