import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import 'bootstrap/dist/css/bootstrap.min.css';
import '@fortawesome/fontawesome-free/css/all.min.css';
import './assets/style/admin.css';
import './index.css'
import { router } from './router.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import { FeedbackProvider } from './components/feedback'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {/* AuthProvider doit englober le router : RequireAuth et Login
        consomment tous les deux useAuth() via le contexte. */}
    <AuthProvider>
      {/* Toasts + modales de confirmation/saisie : remplacent alert/confirm/prompt. */}
      <FeedbackProvider>
        <RouterProvider router={router} />
      </FeedbackProvider>
    </AuthProvider>
  </StrictMode>,
)