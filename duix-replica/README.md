# Duix product replica

This directory combines:

- `site/`: a high-fidelity, responsive implementation of the public Duix marketing experience.
- `upstream/Duix-Avatar/`: the official Duix open-source Electron/Vue avatar client.
- `upstream/duix-doc/`: official API documentation source.
- `upstream/duix-skills/`: official Duix agent skills.

## Run the replicated website

```bash
cd site
npm install
npm run dev
```

Then open the local URL printed by Vite.

## Run the official avatar product

Read `upstream/Duix-Avatar/README_zh.md` before installation. The inference stack requires a supported NVIDIA GPU, Docker images, substantial disk space, and acceptance of the DUIX.COM Community License. This repository preserves the official source unchanged.

## Product and licensing boundary

The website project reproduces the public marketing experience for local development and evaluation. Public Duix marketing assets are recorded in `site/public/assets/SOURCES.txt`; Duix retains all applicable rights. All primary actions remain inside the local app: avatar drafts, saved avatars, and project inquiries use browser local storage. Account, billing, cloud generation, and production APIs are not imitated or linked from the local product flow.

The bundled `Duix-Avatar` source is governed by its own `LICENSE`, including attribution and commercial-use conditions. In particular, redistributed products must prominently display “Built with DUIX.COM.”
