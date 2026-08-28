# Roadmap: Opportunity Compass

## Phase 1: Evidence to Opportunity
**Goal:** Produce a trustworthy daily set of one to three actionable opportunities from Technology Exploration reports.
**Mode:** mvp

**Requirements:** DATA-01, DATA-02, DATA-03, OPP-01, OPP-02, OPP-03, OPP-04, OPP-05

**Success Criteria:**
1. Running the engine against an existing report writes a dated opportunity report.
2. Every emitted opportunity contains buyer, offer, pricing, evidence, experiment, pass condition, and stop condition.
3. The output never contains more than three opportunities.
4. Missing or malformed upstream data produces a recoverable state rather than deleting the last report.

## Phase 2: Native Validation Workbench
**Goal:** Let the user evaluate and track opportunities in a polished local macOS application.
**Mode:** mvp

**Requirements:** FLOW-01, FLOW-02, FLOW-03, FLOW-04, UI-01, UI-02, UI-03, UI-04

**Success Criteria:**
1. The app opens directly on today's opportunity queue and selected opportunity detail.
2. Status and notes survive a full app restart.
3. Evidence links, refresh, history, and report folder actions work.
4. The minimum window has no overlap or horizontal overflow.
5. Dark appearance and Reduce Motion are supported.

---
*Roadmap created: 2026-08-17*

## Milestone v1.1: Solo Business Loop

### Phase 3: Team Capacity Fit
**Goal:** Reframe every opportunity around the capacity, investment, timing, and scope of the selected team size.
**Mode:** mvp

**Requirements:** TEAM-01, TEAM-02, TEAM-03, TEAM-04

**Success Criteria:**
1. The user can switch between three team sizes without losing opportunity state.
2. The visible investment, hours, launch time, scope, roles, and ranking change with team size.
3. Solo mode is the default and all solo recommendations can launch within 30 days.

### Phase 4: Opportunity-to-Profit Workflow
**Goal:** Provide a complete operating path from opportunity evidence through validation, development, launch, promotion, payment, and optimization.
**Mode:** mvp

**Requirements:** LOOP-01, LOOP-02, LOOP-03, LOOP-04, LOOP-05

**Success Criteria:**
1. The user sees all seven stages and can inspect or advance each stage.
2. Every stage contains concrete tasks, time, budget, and a release gate.
3. Task completion and current stage survive a full app restart.
4. Promotion, pricing, break-even, and scope boundaries are visible without interpretation.

### Phase 5: Operating Ledger
**Goal:** Replace hypothetical profit with a local record of actual commercial performance.
**Mode:** mvp

**Requirements:** BIZ-01, BIZ-02, BIZ-03, BIZ-04

**Success Criteria:**
1. The user can record spend, revenue, qualified leads, and paying customers.
2. Profit, ROI, conversion rate, and target gap update immediately.
3. Ledger values survive reload and remain on the local Mac.

---
*v1.1 roadmap completed: 2026-08-17*

## Milestone v1.2: Autonomous Opportunity Factory

### Phase 6: Independent Demand Radar
**Goal:** Continuously collect explicit needs and contact paths without relying on Technology Exploration.

**Requirements:** SRC-01, SRC-02, SRC-03, SRC-04

**Status:** Complete

### Phase 7: Autonomous Product Factory
**Goal:** Decide between direct delivery and reusable product, then automatically launch a functional micro-product with measurable conversion.

**Requirements:** AUTO-01, AUTO-02, AUTO-03, AUTO-04, AUTO-05, AUTO-06

**Status:** Complete

### Phase 8: Unattended Operations and Public Deployment
**Goal:** Run continuously, perform permitted outreach, recover from failure, and serve products securely from `lifeyoume.icu`.

**Requirements:** OPS-01, OPS-02, OPS-03, OPS-04, OPS-05, OPS-06

**Status:** Complete. Deployed to `101.200.39.84` with HTTPS, systemd recovery, Docker proxy recovery, certificate renewal, and rollback backup.

---
*v1.2 roadmap completed: 2026-08-18*
