FROM node:22-slim
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates fonts-liberation unzip \
    libasound2 libatk-bridge2.0-0 libatk1.0-0 libcups2 libdbus-1-3 \
    libdrm2 libgbm1 libgtk-3-0 libnspr4 libnss3 libx11-xcb1 libxcomposite1 \
    libxdamage1 libxfixes3 libxrandr2 libxkbcommon0 xdg-utils \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --omit=dev

COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npx prisma generate

COPY . .

EXPOSE 3000

CMD ["sh", "-c", "npx prisma migrate deploy && node index.js"]