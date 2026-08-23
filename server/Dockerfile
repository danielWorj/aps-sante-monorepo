FROM node:20-slim
WORKDIR /app

# Libs système requises pour exécuter Chrome (pas le paquet "chromium" de la
# distro, dont le nom/la disponibilité varie selon les versions de Debian/Ubuntu
# et qui, sur Ubuntu récent, n'est plus qu'un wrapper snap non fonctionnel en
# conteneur). On laisse Puppeteer télécharger SON PROPRE Chrome testé/garanti
# compatible avec sa version (comportement par défaut, pas de
# PUPPETEER_SKIP_DOWNLOAD), et on installe juste les libs partagées dont ce
# binaire a besoin pour s'exécuter.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates fonts-liberation \
    libasound2 libatk-bridge2.0-0 libatk1.0-0 libcups2 libdbus-1-3 \
    libdrm2 libgbm1 libgtk-3-0 libnspr4 libnss3 libx11-xcb1 libxcomposite1 \
    libxdamage1 libxfixes3 libxrandr2 libxkbcommon0 xdg-utils \
    && rm -rf /var/lib/apt/lists/*

# Dépendances Node (télécharge aussi le Chrome de Puppeteer à cette étape)
COPY package*.json ./
RUN npm ci --omit=dev

# Schéma Prisma (copié avant le reste pour profiter du cache Docker)
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npx prisma generate

# Reste du code
COPY . .

EXPOSE 3000

# Applique les migrations en attente puis démarre le serveur
CMD ["sh", "-c", "npx prisma migrate deploy && node index.js"]