# Changelog

## 2026-09-08

### docs

- Added the MetaHuman asset rebuild guide with public repository boundaries, private backup guidance, SHA-256 checksums, rebuild commands, and acceptance gates.
- Updated the workspace README with MetaHuman rebuild documentation and GitHub auto-sync operational notes.

### fix

- Changed GitHub auto-sync from a two-hour interval to a one-hour interval.
- Added a terminal-launched hourly sync loop to avoid macOS Desktop TCC failures from the LaunchAgent path.
- Allowed `.env.example` template files in auto-sync while continuing to block real `.env` files, private keys, certificates, suspected credential contents, and files larger than 95 MB.

## 2026-09-01

### feat

- Added `english-immersion-studio`, an Electron/React/Three.js desktop product for immersive English roleplay with digital employees, CEFR difficulty controls, language analysis, local avatar baking, neural voice playback, and MetaHuman runtime integration.
- Added `avatar-generator-service`, a local Apple Silicon avatar material generation service that repaints rigged GLB assets with Hunyuan3D-Swift/MLX Paint while preserving skeletons, skin weights, and facial morph targets.
- Added `metahuman-renderer`, an Unreal Engine 5.7 renderer project that defines the MetaHuman scene, Pixel Streaming, camera, wardrobe, hair, and avatar state contracts used by English Immersion Studio.

### docs

- Updated the workspace README with the new project catalog entries, quick-start commands, feature summary, changelog convention, and the `AGI` GitHub remote URL.
