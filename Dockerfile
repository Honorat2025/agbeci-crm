# Image unique pour l'application web et le worker d'envoi.
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && cp -r .next/static .next/standalone/.next/static

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build /app /app
USER node
EXPOSE 3000
# Commande par défaut : mise à jour de la base, puis démarrage du site.
CMD ["sh", "-c", "npm run db:migrate && node .next/standalone/server.js"]
