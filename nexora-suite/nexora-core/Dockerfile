FROM golang:1.23-alpine AS build
WORKDIR /src
COPY api/go.mod ./
COPY api/ ./
RUN CGO_ENABLED=0 go build -o /out/core ./cmd/server

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/core /core
EXPOSE 8080
ENTRYPOINT ["/core"]
