# Коридор — образ без сборки: только Node и исходники
FROM node:22-alpine

WORKDIR /app

# зависимостей нет, но package.json нужен для "type": "module"
COPY package.json ./
COPY server ./server
COPY shared ./shared
COPY public ./public

ENV NODE_ENV=production
ENV PORT=8080
ENV HOST=0.0.0.0
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/health || exit 1

CMD ["node", "server/index.js"]
