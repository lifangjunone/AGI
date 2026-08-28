# Autonomous Demand Sources

## Approved v1.2 Sources

### GitHub Issues REST API

- Purpose: discover explicit implementation requests, help-wanted work, and bounty/reward signals.
- Contact path: the original issue.
- Commercial action: only issues explicitly marked bounty/rewarded are eligible for autonomous outreach.
- Guardrails: dedicated token only, two replies per day, one reply per demand, automation identity disclosure.

### Hacker News Official Firebase API

- Purpose: discover recent Ask HN requests and recurring problems.
- Contact path: original discussion.
- Commercial action: read and cluster only in v1.2 because the official API does not provide posting.
- Guardrails: no profile enrichment or unsolicited email.

## Excluded Without Additional Permission

- Reddit Data API: commercial use and data retention require explicit approval and additional terms.
- Product Hunt API: commercial use requires Product Hunt approval and an access token.
- Closed freelance marketplaces: no scraping or account automation without an approved API.

## Product Decision Rule

- A single paid/bounty request becomes a delivery lead and contact candidate.
- A public product is generated only after the same problem appears from at least three independent authors.
- One new public product per UTC day.
- The generated product must be functional, collect measurable demand, expose the originating public signal, and include a privacy notice.

---
*Verified: 2026-08-18*
