// main.jsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import 'bootstrap/dist/css/bootstrap.min.css';
import '@fortawesome/fontawesome-free/css/all.min.css';
import './assets/styles/style.css';
import './assets/styles/footer-styles.css';
import './assets/styles/portail-medecin.css';
import './assets/styles/portail-assurance.css';
import './assets/styles/reputation-medecin.css';
import './assets/styles/Onboarding.css';
import './index.css'
import { router } from './router.jsx'
import { AuthProvider } from './context/AuthContext'   // ⬅️ ajout
import { FeedbackProvider } from './components/feedback'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      {/* Toasts + modales de confirmation/saisie : remplacent alert/confirm/prompt. */}
      <FeedbackProvider>
        <RouterProvider router={router} />
      </FeedbackProvider>
    </AuthProvider>
  </StrictMode>,
)