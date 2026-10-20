# Étape 1 : build
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .

# Injectées au build : baked dans le bundle JS par Vite.
# VITE_GOOGLE_MAPS_API_KEY : clé publique Maps JavaScript API (restreinte
# par HTTP referrer côté Google Cloud Console). Ne JAMAIS y mettre la clé
# serveur Geocoding/Routes (GOOGLE_MAPS_API_KEY, côté server/.env).
#
# Pas de `ENV X=${X}` : un argument vide (variable absente du .env racine
# lu par docker compose) deviendrait une variable d'environnement VIDE,
# prioritaire pour Vite sur le fichier client-plateform/.env — la carte
# partait alors en production sans clé (« NoApiKeys »). Ici, un argument
# vide est retiré de l'environnement : le .env du dossier sert de repli.
ARG VITE_API_URL
ARG VITE_GOOGLE_MAPS_API_KEY
RUN for v in VITE_API_URL VITE_GOOGLE_MAPS_API_KEY; do \
      eval "val=\${$v}"; [ -n "$val" ] || unset "$v"; \
    done; \
    npm run build

# Étape 2 : serveur statique
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]