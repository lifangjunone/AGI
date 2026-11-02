# Model registry browser regression

This script launches an isolated localhost MaaS gateway with 100 fixture models
and a mock provider. It never uses production data, keys, routes or inference.
It runs visibly by default and requires the Playwright skill dependencies.

From any checkout, set `MAAS_PROJECT_ROOT` to the MaaS project directory:

```bash
MAAS_PROJECT_ROOT="$PWD" PW_ARTIFACT_DIR=/tmp/maas-registry-evidence \
  node /Users/bytedance/.codex/skills/playwright-skill/run.js \
  "$PWD/tests/browser/registry.cjs"
```

Run from the MaaS root. The skill executor path is installation-specific.
Screenshots are desktop, 375px portrait and 812px landscape; only synthetic
masked keys appear. The test-owned temporary state is removed after the
gateway exits when screenshots are kept in a separate artifact directory.

Coverage: pagination (10/20/50), name sort, search/combined capability/provider
filters, all status filter options (failed uses an empty result), reload and
Back/Forward restoration, keyboard focus preservation, model creation,
key reveal/hide, mock provider authentication test, editing, disable, delete,
cross-page selection, cancelled bulk requests, partial failure retention/retry,
bulk enable/delete, managed TTS protection, reduced motion and no page overflow.
Capability selection discloses registered-only models before saving; unsupported
creation and editing return truthful feedback. Desktop and mobile form screenshots
use synthetic test credentials (password fields masked).
Embeddings workbench uses a synthetic application key against the real local
gateway and mock upstream: ungranted403 → granted vectors, batch summary,
token usage, Key clearing, folded raw JSON, clear-result cleanup and mobile layout.
External TTS workbench routes a synthetic supplier credential and voice through
the real local gateway, returns a generated silent WAV, shows play/download,
clears Key on model switches and clears old audio when returning to managed
TTS. Managed five-voice selection is retained; this is not a real-supplier test.
Image workbench uses the actual local HTTP gateway and mock supplier: base64
PNG decodes in the browser, download uses a Blob URL, service Key clears;
remote image is not fetched before click, a404 yields explicit load failure,
and reset removes images. These are synthetic fixtures, not generated artwork.
Vision workbench builds text/image_url parts for the actual local chat gateway:
unsafe HTTP links rejected in the form, authorized mock VLM returns text,
Key clears and 375px layout has no horizontal overflow. No real image
understanding or supplier accuracy is proven by this test.

This does not prove production provider inference, populated failed-status rows,
clipboard/30-second expiry, TTS playback,
MeYou migration or unimplemented multimodal runtimes. Other suites and explicit
production acceptance remain necessary.
