# Design and verification notes

## North star

Large areas of calm white space, real people as the visual subject, and purple reserved for primary action. Typography carries the hierarchy; surfaces stay quiet.

## Reference baseline

- Desktop reference viewport: 1440 × 900; full page measured at roughly 1440 × 6414.
- Mobile reference viewport: 390 × 844; full page measured at roughly 390 × 7637.
- Fidelity comes from the Duix public site observed on 2026-10-28 and its public marketing assets.

## Interaction and motion

- Primary controls compress and change color immediately.
- Use-case selection changes the portrait, copy, and selected control as one transition.
- Hero content enters in reading order; later sections reveal once.
- The business portrait scales and travels with scroll as the page’s scroll-driven story.
- Reduced-motion mode renders content directly with no scroll choreography.

## Honest limitations

The official marketing-site source is not publicly available. Cloud account, billing, avatar generation, and live conversation services require Duix infrastructure and credentials, so the local replica links those actions to the official service. The official open-source avatar client is included unchanged but its GPU inference runtime cannot run on the current macOS host.
