PRODUCTS := nexora-core nexora-studio nexora-control nexora-maas nexora-runtime

.PHONY: test build compose-config

test:
	@for product in $(PRODUCTS); do \
		echo "==> testing $$product"; \
		(cd $$product/api && go test ./...); \
	done
	@echo "==> testing nexora-runtime worker"
	@(cd nexora-runtime/worker && go test ./...)
	@echo "==> testing nexora-runtime adapters"
	@(cd nexora-runtime/adapters && go test ./...)

build:
	@for product in $(PRODUCTS); do \
		echo "==> building $$product API"; \
		(cd $$product/api && go build ./cmd/server); \
	done
	@echo "==> building nexora-runtime worker"
	@(cd nexora-runtime/worker && go build ./cmd/worker)
	@echo "==> building nexora-runtime adapters"
	@(cd nexora-runtime/adapters && go test ./...)
	@for product in $(PRODUCTS); do \
		echo "==> building $$product web"; \
		(cd $$product/web && npm install && npm run build); \
	done

compose-config:
	docker compose -f deployments/docker-compose.yml config --quiet
