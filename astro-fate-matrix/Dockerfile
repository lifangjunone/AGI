FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=45330

COPY package.json ./
COPY src ./src
COPY public ./public
COPY vendor ./vendor

USER root
RUN sed -i 's#https://dl-cdn.alpinelinux.org/alpine#https://mirrors.tencent.com/alpine#g' /etc/apk/repositories \
  && apk add --no-cache python3 py3-pip \
  && python3 -m pip install --break-system-packages --no-cache-dir \
    -i http://mirrors.tencentyun.com/pypi/simple --trusted-host mirrors.tencentyun.com \
    "lunar_python>=1.4.8,<2" "tzdata>=2024.1"

RUN mkdir -p /app/data && chown -R node:node /app/data /app
USER node
EXPOSE 45330
CMD ["node", "src/server.mjs"]
