FROM node:22-alpine

WORKDIR /app
COPY package.json ./
COPY server.mjs ./
COPY src ./src

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=45410
EXPOSE 45410
USER node
CMD ["node", "server.mjs"]
