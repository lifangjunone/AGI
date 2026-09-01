# Spike Conventions

Patterns and stack choices established across spike sessions. New spikes follow
these unless the question requires otherwise.

## Stack

- Use the existing Electron, React, TypeScript, and Three.js application when a
  candidate provides GLB/glTF assets that can be tested directly.
- Use Unreal Engine for future production MetaHuman rendering experiments.
- Keep research automation and asset inspection local and reproducible.

## Structure

- Store each experiment under `.planning/spikes/NNN-descriptive-name/`.
- Store screenshots and runtime evidence under the application's
  `test-results/` directory.
- Keep downloaded disposable evaluation assets in `/tmp`; document their exact
  source and observed structure in the spike README.

## Patterns

- Evaluate avatar platforms on a single weighted rubric before choosing one.
- Separate authoring-platform support from runtime-platform support.
- Treat identity geometry, hair, clothing, body, and accessories as modular
  systems.
- Do not describe a texture projection as 3D identity reconstruction.
- Record unsupported hardware and cloud dependencies explicitly.

## Tools & Libraries

- Prefer official vendor documentation and inspect representative assets when
  available.
- Use the existing GLTFLoader path to test WebGL-compatible candidate assets.
- Use Playwright screenshots and console checks for visual integration evidence.
