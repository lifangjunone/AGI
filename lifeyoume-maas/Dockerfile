FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY src ./src
COPY public ./public
RUN mkdir -p /var/lib/lifeyoume-maas && chown -R node:node /var/lib/lifeyoume-maas /app
USER node
ENV NODE_ENV=production MAAS_HOST=127.0.0.1 MAAS_PORT=43280 MAAS_DATA_PATH=/var/lib/lifeyoume-maas/state.json
EXPOSE 43280
CMD ["node", "src/server.mjs"]
