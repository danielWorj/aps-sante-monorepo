// src/routes/RequireAuth.jsx
//
// Garde de route pour l'espace admin. Placée comme élément parent des
// routes privées dans router.jsx :
//
//   { element: <RequireAuth />, children: [ ...routes privées... ] }
//
// - Pendant la restauration de session (status === 'loading', cf.
//   AuthContext), affiche un simple indicateur de chargement : à ce
//   stade on ne SAIT PAS encore si l'utilisateur est connecté, donc on
//   ne redirige surtout pas vers /login (ça déconnecterait à tort
//   quelqu'un dont la session cookie est en fait valide).
// - Une fois le statut stabilisé : redirige vers /login si non
//   authentifié (en mémorisant la page demandée dans `state.from` pour
//   y revenir après connexion), sinon rend les routes enfants via
//   <Outlet/>.
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function RequireAuth() {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <i
          className="fa-solid fa-spinner fa-spin"
          style={{ fontSize: 24, color: 'var(--aps-primary-600)' }}
        />
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}