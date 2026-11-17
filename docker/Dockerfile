FROM node:24-bookworm-slim AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM node:24-bookworm-slim
ENV NODE_ENV=production \
    PLAYWRIGHT_BROWSERS_PATH=/opt/playwright
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --include=dev \
    && node node_modules/playwright/cli.js install --with-deps chromium \
    && chmod -R a+rX /opt/playwright \
    && rm -rf /var/lib/apt/lists/*
COPY backend/src ./src
COPY backend/tsconfig.json ./
COPY converter /app/converter
COPY --from=frontend /app/frontend/dist /app/frontend/dist
COPY --from=frontend /app/frontend/node_modules/three /app/frontend/node_modules/three
RUN mkdir -p storage logs && chown -R node:node storage logs
USER node
EXPOSE 3000
CMD ["node", "--import", "tsx", "src/server.ts"]
