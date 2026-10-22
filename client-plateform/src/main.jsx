// main.jsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import 'bootstrap/dist/css/bootstrap.min.css';
import '@fortawesome/fontawesome-free/css/all.min.css';
import './assets/styles/style.css';
import './assets/styles/portail-medecin.css';
import './assets/styles/portail-assurance.css';
import './assets/styles/reputation-medecin.css';
import './assets/styles/Onboarding.css';
import './index.css'
// Refonte UI web 2026 : aligne Bootstrap + primitives aps-* (en dernier).
import './assets/styles/theme-2026.css';
import { router } from './router.jsx'
import { AuthProvider } from './context/AuthContext'   // ⬅️ ajout
import { FeedbackProvider } from './components/feedback'
import { PaysProvider } from './context/PaysContext'
import GardePin from './components/auth/GardePin'
import GeolocConsentementHote from './components/geoloc/GeolocConsentementHote'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      {/* Toasts + modales de confirmation/saisie : remplacent alert/confirm/prompt. */}
      <FeedbackProvider>
        {/* Pays de l'utilisateur (détecté ou choisi), partagé par tout le site. */}
        <PaysProvider>
          <RouterProvider router={router} />
        </PaysProvider>
        {/* Code PIN demandé par le serveur pour les opérations protégées. */}
        <GardePin />
        {/* Explique pourquoi on demande la position avant la boîte du navigateur. */}
        <GeolocConsentementHote />
      </FeedbackProvider>
    </AuthProvider>
  </StrictMode>,
)