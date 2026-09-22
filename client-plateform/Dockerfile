# Étape 1 : build
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .

# Injectée au build : baked dans le bundle JS par Vite
ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}
# Clé publique Maps JavaScript API (restreinte par HTTP referrer côté
# Google Cloud Console — voir client-plateform/.env.example). Ne JAMAIS
# y mettre la clé serveur Geocoding/Directions (GOOGLE_MAPS_API_KEY,
# côté server/.env), qui elle n'a pas vocation à être publique.
ARG VITE_GOOGLE_MAPS_API_KEY
ENV VITE_GOOGLE_MAPS_API_KEY=${VITE_GOOGLE_MAPS_API_KEY}
RUN npm run build

# Étape 2 : serveur statique
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]