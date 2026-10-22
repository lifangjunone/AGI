PRODUCTS := nexora-core nexora-studio nexora-control nexora-maas

.PHONY: test build compose-config

test:
	@for product in $(PRODUCTS); do \
		echo "==> testing $$product"; \
		(cd $$product/api && go test ./...); \
	done

build:
	@for product in $(PRODUCTS); do \
		echo "==> building $$product API"; \
		(cd $$product/api && go build ./cmd/server); \
	done
	@for product in $(PRODUCTS); do \
		echo "==> building $$product web"; \
		(cd $$product/web && npm install && npm run build); \
	done

compose-config:
	docker compose -f deployments/docker-compose.yml config --quiet
