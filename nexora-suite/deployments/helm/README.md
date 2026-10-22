# Helm deployment editions

Choose one commercial deployment edition. Core is included in every edition; MaaS, Studio, and Control are independently optional.

```bash
# Core + Studio
helm dependency build editions/studio
helm upgrade --install nexora editions/studio

# Core + Control
helm dependency build editions/control
helm upgrade --install nexora editions/control

# Core + MaaS
helm dependency build editions/maas
helm upgrade --install nexora editions/maas

# Core + MaaS + Studio + Control
helm dependency build editions/full
helm upgrade --install nexora editions/full
```

The underlying product charts remain independently versioned under each product's `deploy/helm` directory. Provide production secrets with an external secret controller or pre-created Kubernetes Secrets.

Each edition now deploys the selected products' API and Web workloads, Services, Ingresses, probes, HPAs, migrations, and optional private-cloud infrastructure. See [Kubernetes deployment](../../docs/kubernetes.md) for production values, external-infrastructure mode, verification, upgrades, rollback, and uninstall.
