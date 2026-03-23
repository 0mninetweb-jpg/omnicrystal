FROM node:22-slim

WORKDIR /app

COPY functions/package*.json ./functions/
RUN cd functions && npm ci --omit=dev

COPY crystal-core/package*.json ./crystal-core/
RUN cd crystal-core && npm install --omit=dev

COPY functions ./functions
COPY crystal-core ./crystal-core

ENV PORT=8080

WORKDIR /app/crystal-core

CMD ["node", "server.js"]
