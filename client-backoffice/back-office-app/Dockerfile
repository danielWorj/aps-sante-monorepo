FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .

ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}
# Marque affichée (src/lib/marque.js). Un argument vide est retiré de
# l'environnement : le .env du dossier, puis les défauts du code, servent de repli.
ARG VITE_NOM_MARQUE
ARG VITE_RAISON_SOCIALE
RUN for v in VITE_NOM_MARQUE VITE_RAISON_SOCIALE; do \
      eval "val=\${$v}"; [ -n "$val" ] || unset "$v"; \
    done; \
    npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]