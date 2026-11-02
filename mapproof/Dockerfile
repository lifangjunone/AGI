FROM node:22-alpine

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server.mjs ./
COPY src ./src

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=45210
EXPOSE 45210
USER node
CMD ["node", "server.mjs"]
