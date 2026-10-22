// ChoisirEspace.jsx — « Choisir mon espace ».
//
// Affiché après la connexion quand le compte a plusieurs espaces (patient,
// médecin, structure gérée, publicités…), et accessible ensuite depuis le
// menu (« Changer d'espace »). Le dernier espace utilisé est en tête.
import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { accueilEspace } from '../utils/roles';

const ICONES = {
  patient: 'fa-user',
  medecin: 'fa-user-doctor',
  pharmacie: 'fa-prescription-bottle-medical',
  structure: 'fa-hospital',
  assurance: 'fa-building-shield',
  laboratoire: 'fa-flask-vial',
  publicites: 'fa-bullhorn',
  ambulance: 'fa-truck-medical',
  pompes_funebres: 'fa-dove',
};

export default function ChoisirEspace() {
  const navigate = useNavigate();
  const { espaces, choisirEspace } = useAuth();
  const [occupe, setOccupe] = useState(null);
  const [erreur, setErreur] = useState(null);

  if (espaces.length === 1) return <Navigate to={accueilEspace(espaces[0])} replace />;

  // Le serveur ouvre une session sur l'espace choisi (rôle de cet espace) ;
  // pour un espace professionnel, le code PIN peut être demandé (GardePin).
  const ouvrir = async (espace) => {
    setOccupe(espace.cle);
    setErreur(null);
    try {
      await choisirEspace(espace.cle);
      navigate(accueilEspace(espace), { replace: true });
    } catch (err) {
      setErreur(err?.data?.code === 'PIN_REQUIS' ? 'Code PIN nécessaire pour ouvrir cet espace.' : err?.message || 'Impossible d’ouvrir cet espace.');
    } finally {
      setOccupe(null);
    }
  };

  return (
    <section style={{ padding: '3rem 0' }}>
      <div className="container-aps" style={{ maxWidth: 560 }}>
        <span className="eyebrow">Mon compte</span>
        <h1 style={{ fontSize: '1.5rem', marginTop: '.6rem' }}>Choisir mon espace</h1>
        <p className="text-muted-soft">Où souhaitez-vous aller ? Vous pourrez changer d’espace à tout moment depuis le menu.</p>

        {erreur && <div className="alert alert-danger mt-3" role="alert">{erreur}</div>}

        <div className="d-flex flex-column gap-2 mt-3">
          {espaces.map((e) => (
            <button
              key={e.cle}
              type="button"
              className="info-card text-start d-flex align-items-center gap-3"
              style={{ padding: '1rem 1.1rem', margin: 0, cursor: 'pointer', border: e.dernier ? '1.5px solid var(--primary)' : undefined }}
              onClick={() => ouvrir(e)}
              disabled={occupe !== null}
            >
              <span
                style={{
                  width: 44, height: 44, borderRadius: 10, flex: '0 0 44px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'var(--primary-tint)', color: 'var(--primary-dark)',
                }}
              >
                <i className={`fa-solid ${ICONES[e.type] ?? 'fa-circle-user'}`} />
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <strong style={{ display: 'block' }}>{e.libelle}</strong>
                {e.detail && <span className="text-muted-soft" style={{ fontSize: '.84rem' }}>{e.detail}</span>}
              </span>
              {e.dernier && <span className="chip chip-verifie">Dernier utilisé</span>}
              {e.professionnel && <i className="fa-solid fa-lock" title="Code PIN demandé" style={{ color: 'var(--ink-faint)', fontSize: '.8rem' }} />}
              <i className={`fa-solid ${occupe === e.cle ? 'fa-spinner fa-spin' : 'fa-chevron-right'}`} style={{ color: 'var(--ink-faint)' }} />
            </button>
          ))}
          {espaces.length === 0 && (
            <div className="aps-empty-state">
              <i className="fa-solid fa-circle-user" />
              <div>Aucun espace n’est encore rattaché à votre compte.</div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
