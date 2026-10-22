FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm install
FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG NEXT_PUBLIC_CORE_API=/api/v1/auth/login
ENV NEXT_PUBLIC_CORE_API=$NEXT_PUBLIC_CORE_API
RUN npm run build
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --chown=node:node --from=build /app ./
USER node
EXPOSE 3000
CMD ["npm", "run", "start"]
