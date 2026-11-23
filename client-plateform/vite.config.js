import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

const echapperHtml = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Même valeur et même défaut que src/lib/marque.js (NOM_MARQUE).
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const nomMarque = (env.VITE_NOM_MARQUE || '').trim() || 'ApSa'

  return {
    plugins: [
      react(),
      {
        // Titre de l'onglet : %NOM_MARQUE% dans index.html.
        name: 'nom-marque-html',
        transformIndexHtml: (html) => html.replaceAll('%NOM_MARQUE%', echapperHtml(nomMarque)),
      },
    ],
  }
})
