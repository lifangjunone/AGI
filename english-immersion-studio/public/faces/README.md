# Local Face Reference Library

These 30 portraits were generated locally with
`mlx-community/flux2-klein-4b-4bit` through `mflux 0.19.1`.

- `k-stage-01.jpg` through `k-stage-10.jpg`: seeds 31001-31010
- `j-fashion-01.jpg` through `j-fashion-10.jpg`: seeds 32001-32010
- `executive-01.jpg` through `executive-10.jpg`: seeds 33001-33010
- Resolution: 768 x 768
- Subject constraint: fictional East Asian women, age 25-32, with no named
  person or celebrity in the prompts

The reproducible generation command is in
`scripts/generate-face-library.sh`.

These files are portrait references. They are not 3D models and must not be
presented as completed avatar identities until a reconstruction and rigging
pipeline has produced a corresponding animated VRM or GLB.
