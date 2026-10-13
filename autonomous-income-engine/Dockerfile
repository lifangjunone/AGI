FROM node:22-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4188 \
    AIE_DATA_DIR=/app/state/data \
    AIE_RUNTIME_DIR=/app/state/runtime \
    AIE_DIST_DIR=/app/state/dist \
    AIE_PUBLIC_SITE_DIR=/app/state/public-site \
    WECHAT_QR_PATH=/run/secrets/wechat-pay.jpg \
    ADAPTERS_FROM_ENV=1 \
    REQUIRE_PAYMENT_WEBHOOK_SECRET=1 \
    REQUIRE_ADMIN_API_SECRET=1 \
    TRUST_PROXY=1 \
    PAYMENT_AUTOSYNC=1 \
    PAYMENT_SYNC_INTERVAL_SECONDS=15 \
    COMMERCE_AUTORUN=1 \
    COMMERCE_INTERVAL_SECONDS=900 \
    PUBLIC_ACCESS_MONITOR=0

COPY package.json ./
COPY src ./src
COPY scripts ./scripts
COPY public ./public

RUN mkdir -p /app/state/data /app/state/runtime /app/state/dist /app/state/public-site /run/secrets \
    && chown -R node:node /app /run/secrets

USER node

EXPOSE 4188

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:4188/api/status',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "src/server.js"]
