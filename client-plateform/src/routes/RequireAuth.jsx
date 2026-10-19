// src/routes/RequireAuth.jsx
//
// Garde des espaces privés. Placée comme élément parent des routes
// privées dans router.jsx :
//
//   { element: <RequireAuth roles={ROLES_ESPACE.medecin} />, children: [ ... ] }
//
// - Pendant la restauration de session (status === 'loading', cf.
//   AuthContext), affiche un simple indicateur de chargement : à ce
//   stade on ne SAIT PAS encore si l'utilisateur est connecté, donc on
//   ne redirige surtout pas vers /login (ça déconnecterait à tort
//   quelqu'un dont la session cookie est en fait valide).
// - Non authentifié : redirige vers /login (en mémorisant la page
//   demandée dans `state.from` pour y revenir après connexion).
// - Authentifié mais avec un rôle absent de `roles` : renvoie vers
//   l'accueil de SON espace (un patient ne peut pas ouvrir le portail
//   médecin, ni l'inverse). `roles` est obligatoire : une route privée
//   doit toujours dire quels rôles y ont accès.
import { useEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/feedback';
import { accueilParRole, aUnRole } from '../utils/roles';

export default function RequireAuth({ roles }) {
  const { status, user } = useAuth();
  const location = useLocation();
  const toast = useToast();
  const refuse = status === 'authenticated' && !aUnRole(user, roles ?? []);

  useEffect(() => {
    if (refuse) toast.avertissement('Cet espace n’est pas accessible avec votre compte.');
  }, [refuse, toast]);

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

  if (refuse) {
    return <Navigate to={accueilParRole(user?.role)} replace />;
  }

  return <Outlet />;
}
