FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json server.mjs ./
COPY src ./src
RUN chmod -R a+rX /app
USER node
ENV HOST=127.0.0.1 PORT=45620 BASE_PATH=/status-capsule
CMD ["node", "server.mjs"]
