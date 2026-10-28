ARG DOCKER_PROXY=docker.m.daocloud.io/library
FROM ${DOCKER_PROXY}/node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm ci --omit=dev && npm cache clean --force
COPY packages/shared/dist packages/shared/dist
COPY apps/api/dist apps/api/dist
COPY apps/api/drizzle apps/api/drizzle
COPY apps/web/dist apps/web/dist
COPY apps/worker/dist apps/worker/dist
USER node
CMD ["node", "apps/api/dist/server.js"]
