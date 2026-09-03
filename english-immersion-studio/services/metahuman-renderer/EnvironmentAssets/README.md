# Environment Asset Sources

The environment production pipeline uses the assets pinned in
`polyhaven-assets.json`.

- Provider: Poly Haven
- License: CC0 1.0 Universal
- Source API: `https://api.polyhaven.com`
- Runtime source format: 1K glTF

The raw downloads are reproducible and therefore excluded from Git under
`services/metahuman-renderer/ExternalAssets/`. Imported Unreal assets under
`Content/EnglishImmersion/Environment/` are the offline runtime deliverable.

Run from `english-immersion-studio`:

```bash
npm run environment:setup
```

The downloader verifies every file against the MD5 published by the Poly Haven
API and writes a resolved lock file alongside the downloaded source files.
