# Requirements: Opportunity Compass

**Defined:** 2026-08-17
**Core Value:** Surface one to three evidence-backed, sellable opportunities every day.

## v1 Requirements

### Data

- [x] **DATA-01**: The app reads the newest valid Technology Exploration Agent JSON report.
- [x] **DATA-02**: The app continues to show the last generated opportunity report when upstream collection is unavailable.
- [x] **DATA-03**: The app stores generated opportunity reports locally by date.

### Opportunity Intelligence

- [x] **OPP-01**: The user receives between one and three ranked opportunities per daily report.
- [x] **OPP-02**: Every opportunity identifies a target buyer, painful job, sellable offer, pricing hypothesis, and acquisition channel.
- [x] **OPP-03**: Every opportunity exposes source evidence and distinguishes observed facts from hypotheses.
- [x] **OPP-04**: Every opportunity includes a seven-day validation plan with measurable pass and stop conditions.
- [x] **OPP-05**: The engine rejects candidates without a reachable buyer, monetization path, evidence, or feasible first test.

### Workflow

- [x] **FLOW-01**: The user can move an opportunity through New, Validating, Contacted, Won, and Rejected states.
- [x] **FLOW-02**: The user can record private notes for each opportunity.
- [x] **FLOW-03**: Opportunity state and notes persist across app restarts.
- [x] **FLOW-04**: The user can browse previous daily opportunity reports.

### Desktop Experience

- [x] **UI-01**: The app opens directly into the daily opportunity workbench.
- [x] **UI-02**: The interface remains usable at a 980 x 640 minimum window size.
- [x] **UI-03**: The interface supports light/dark appearance, keyboard focus, and Reduce Motion.
- [x] **UI-04**: Refresh, report folder, external evidence links, loading, failure, and recovery states are visible and understandable.

## v2 Requirements

### Validation Automation

- **AUTO-01**: Generate outreach drafts tailored to the selected buyer.
- **AUTO-02**: Create a landing-page experiment and track replies.
- **AUTO-03**: Compare predicted opportunity quality with actual validation outcomes.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Guaranteed earnings | No system can honestly guarantee customer payment |
| Automatic purchasing or investment | Not required for opportunity validation |
| Shared cloud workspace | Local-first personal workflow is the v1 target |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| DATA-01, DATA-02, DATA-03 | Phase 1 | Complete |
| OPP-01, OPP-02, OPP-03, OPP-04, OPP-05 | Phase 1 | Complete |
| FLOW-01, FLOW-02, FLOW-03, FLOW-04 | Phase 2 | Complete |
| UI-01, UI-02, UI-03, UI-04 | Phase 2 | Complete |

**Coverage:** 16 v1 requirements, 16 mapped, 0 unmapped.

---
*Requirements defined: 2026-08-17*
*Last updated: 2026-08-17 after v1 verification*

## v1.1 Solo Business Loop Requirements

### Team Capacity

- [x] **TEAM-01**: User can compare every opportunity for solo, 2-5 person, and 6-20 person teams.
- [x] **TEAM-02**: Each team profile shows feasibility, cash investment, labor hours, launch time, scope, and required roles.
- [x] **TEAM-03**: The app defaults to solo mode and ranks visible opportunities by solo feasibility.
- [x] **TEAM-04**: Solo recommendations define an explicit scope boundary and can launch within 30 days.

### End-to-End Execution

- [x] **LOOP-01**: User can progress through Discover, Validate, Build, Launch, Promote, Monetize, and Optimize stages.
- [x] **LOOP-02**: Every stage includes an objective, estimated days, budget, executable tasks, and a release gate.
- [x] **LOOP-03**: User can complete individual stage tasks and retain progress across restarts.
- [x] **LOOP-04**: User can advance or directly select the current operating stage.
- [x] **LOOP-05**: Every opportunity includes a concrete promotion channel, first offer, revenue model, break-even logic, and stop boundary.

### Business Ledger

- [x] **BIZ-01**: User can record actual spend and revenue for an opportunity.
- [x] **BIZ-02**: User can record qualified leads and paying customers.
- [x] **BIZ-03**: The app calculates profit, ROI, lead conversion, and distance to the monthly revenue target.
- [x] **BIZ-04**: Business ledger values remain local and persist across restarts.

## v1.1 Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| TEAM-01, TEAM-02, TEAM-03, TEAM-04 | Phase 3 | Complete |
| LOOP-01, LOOP-02, LOOP-03, LOOP-04, LOOP-05 | Phase 4 | Complete |
| BIZ-01, BIZ-02, BIZ-03, BIZ-04 | Phase 5 | Complete |

**v1.1 Coverage:** 13 requirements, 13 mapped, 0 unmapped.

---
*v1.1 requirements defined and verified: 2026-08-17*

## v1.2 Autonomous Opportunity Factory Requirements

### Independent Demand Intelligence

- [x] **SRC-01**: Collect public demand independently from Technology Exploration.
- [x] **SRC-02**: Use official GitHub Issues and Hacker News APIs with source-specific limits and error recovery.
- [x] **SRC-03**: Deduplicate demand locally and retain original source, author, time, labels, contact path, and evidence.
- [x] **SRC-04**: Score explicit demand, payment signals, recency, contactability, and solo buildability separately.

### Autonomous Decision and Delivery

- [x] **AUTO-01**: Route explicit bounty/reward requests into a contactable delivery queue.
- [x] **AUTO-02**: Require the same problem from at least three independent authors before generating a public product.
- [x] **AUTO-03**: Generate no more than one new public product per UTC day.
- [x] **AUTO-04**: Launch a functional micro-tool, not only a static landing page.
- [x] **AUTO-05**: Publish lead capture, source attribution, privacy notice, RSS, sitemap, and robots metadata.
- [x] **AUTO-06**: Persist product views, leads, outreach state, and cycle events.

### Safe Outreach and Operations

- [x] **OPS-01**: Keep autonomous outreach disabled unless a dedicated token and explicit feature flag are configured.
- [x] **OPS-02**: Limit GitHub outreach to explicit bounty/reward labels, two messages per day, and one per demand.
- [x] **OPS-03**: Disclose automation identity and non-repeat policy in every generated outreach message.
- [x] **OPS-04**: Run continuously with restart recovery on macOS and Linux.
- [x] **OPS-05**: Protect the private dashboard with credentials and store secrets outside source control.
- [x] **OPS-06**: Deploy behind HTTPS at `lifeyoume.icu`.

## v1.2 Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| SRC-01, SRC-02, SRC-03, SRC-04 | Phase 6 | Complete |
| AUTO-01, AUTO-02, AUTO-03, AUTO-04, AUTO-05, AUTO-06 | Phase 7 | Complete |
| OPS-01, OPS-02, OPS-03, OPS-04, OPS-05 | Phase 8 | Complete |
| OPS-06 | Phase 8 | Complete |

**v1.2 Coverage:** 16 requirements, 16 mapped, 16 complete.

---
*v1.2 requirements updated: 2026-08-18*
