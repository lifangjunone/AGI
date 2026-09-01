# Spike Manifest

## Idea

Select one production avatar platform for English Immersion Studio that replaces
the current monolithic GLB plus texture-projection approach and can deliver
convincing close-up digital employees with identity, hair, clothing, facial
animation, and body animation.

## Requirements

- Visual fidelity is the primary selection criterion.
- The selected architecture must use real 3D head geometry and a production
  facial rig; a projected 2D face is not an acceptable final result.
- Hair, body, clothing, and accessories must be modular assets rather than one
  inseparable mesh.
- Characters must support natural blinking, lip sync, expressions, breathing,
  and upper-body gestures.
- The product targets Apple Silicon, currently an M5 Pro with 48 GB memory.
- Any platform or authoring step that cannot run privately on this Mac must be
  disclosed rather than hidden behind an unreliable runtime service.
- The existing local MediaPipe UV bake is a fallback/prototype, not the final
  identity system.

## Spikes

| # | Name | Type | Validates | Verdict | Tags |
|---|------|------|-----------|---------|------|
| 001 | avatar-platform-selection | comparison | Given the product constraints, when leading commercial and open-source avatar systems are evaluated and a representative WebGL asset is tested, then one highest-fidelity production direction can be selected with its costs made explicit | VALIDATED | avatar, metahuman, unreal, threejs, digital-human |
