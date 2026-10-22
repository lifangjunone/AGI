FROM golang:1.23-alpine AS build
WORKDIR /src
COPY api/go.mod ./
COPY api/ ./
RUN CGO_ENABLED=0 go build -o /out/maas ./cmd/server
FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/maas /maas
EXPOSE 8080
ENTRYPOINT ["/maas"]
