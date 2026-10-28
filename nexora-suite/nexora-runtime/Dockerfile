FROM golang:1.23-alpine AS build
WORKDIR /src/api
COPY adapters/ /src/adapters/
COPY api/ /src/api/
RUN CGO_ENABLED=0 go build -o /out/runtime ./cmd/server
FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/runtime /runtime
COPY packages /packages
ENV NEXORA_RUNTIME_PACKAGES=/packages
EXPOSE 8084
ENTRYPOINT ["/runtime"]
