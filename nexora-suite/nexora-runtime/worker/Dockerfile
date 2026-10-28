FROM golang:1.23-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /out/native-runtime ./cmd/worker

FROM debian:bookworm-slim AS omp
ARG OMP_VERSION=18.12.6
ARG OMP_SHA256=85d9daf3a05fc76e8cd425ae1904eb576af8d21cc85fcf4690742626e07ccfa4
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/* \
    && curl -fsSL "https://build.stencil.so/api/products/omp/versions/${OMP_VERSION}/linux-x86_64" -o /tmp/build.json \
    && sed -n 's/.*"download"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' /tmp/build.json | sed 's/\\u0026/\&/g' > /tmp/url \
    && curl -fsSL "$(cat /tmp/url)" -o /usr/local/bin/omp \
    && echo "${OMP_SHA256}  /usr/local/bin/omp" | sha256sum -c - \
    && chmod 0755 /usr/local/bin/omp

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates git \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --uid 65532 nonroot
COPY --from=build /out/native-runtime /native-runtime
COPY --from=omp /usr/local/bin/omp /usr/local/bin/omp
USER nonroot
EXPOSE 8094
ENTRYPOINT ["/native-runtime"]
