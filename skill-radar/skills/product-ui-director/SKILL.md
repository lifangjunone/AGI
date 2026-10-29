---
name: product-ui-director
description: Direct product UI redesigns from product story through divergent visual concepts, interactive review, implementation, and screenshot-based quality control. Use when a user wants a distinctive product-grade interface or rejects an existing UI as generic, confusing, demo-like, or visually weak. Do not use for routine copy, spacing, or isolated component edits with an already-approved design.
---

# Product UI Director

Act as the design lead and stage the work so product judgment is settled before production code changes.

## Route the request

Choose the smallest mode that fits:

- **Explore:** the product direction or visual language is unresolved. Produce concepts and prototypes only.
- **Redesign:** the product flow exists but the interface is rejected. Preserve verified domain behavior while rethinking information architecture and visual expression.
- **Implement:** a direction has been explicitly selected. Translate it into the real stack and states.
- **Audit:** review an implementation against the approved direction and observable UX outcomes.

If the user asks to explore or review designs, do not modify the production UI. Work in a separate design/prototype location unless the user explicitly asks for direct implementation.

## Compose available capabilities

Use each capability for the job it is good at:

1. **`frontend-design`** — lead aesthetic direction, typography, composition, anti-template critique, and interface copy. Read its `SKILL.md` before concept work.
2. **OpenDesign** — optional high-fidelity design workspace when installed or when the user wants editable visual prototypes. Do not install, launch, or connect it without authorization. If absent, create isolated runnable prototypes with the existing stack.
3. **`ui-ux-pro-max`** — verify accessibility, interaction, responsive behavior, navigation, forms, and stack-specific implementation guidance. It is a quality gate, not the visual author.
4. **`playwright-skill`** — render the real prototype or app at target viewports, capture screenshots, exercise key flows, and verify overflow and interaction states.

Do not treat component libraries, Tailwind presets, or generated dashboards as design decisions. Components implement a chosen language; they do not create one.

## Design workflow

### 1. Reconstruct the product story

Inspect existing product documents, screenshots, real content, and implemented states before drawing. Reduce the brief to:

- target user and the moment they open the product;
- the job they are trying to complete;
- the one product mechanism customers must understand;
- the proof or result that earns trust;
- the primary action and important exception states.

State contradictions or missing decisions briefly. Do not hide them with visual polish.

### 2. Establish a visual thesis

Create a compact thesis specific to the product:

- one memorable spatial or interaction idea;
- typography with a reason;
- palette tied to the subject matter;
- information density and rhythm;
- motion used only to explain state change;
- explicit anti-patterns to avoid.

Run the `frontend-design` anti-template critique before rendering. Reject concepts that could fit any generic SaaS dashboard.

### 3. Diverge meaningfully

When direction is not approved, produce at least three concepts that differ in product metaphor, composition, navigation, and interaction—not merely color or radius.

Use the same realistic product content and state in every concept so the comparison is fair. For each concept show:

- one representative desktop screen;
- the primary user action;
- one difficult state such as empty, blocked, collaboration, evidence, or review;
- why the direction fits the product and what it sacrifices.

Present concepts side by side or through a simple index. Do not ask the user to judge descriptions without rendered evidence.

### 4. Stop at the selection gate

Do not merge a concept into production until the user selects or combines directions. Record the selected thesis and rejected traits so implementation does not drift back to a generic default.

### 5. Implement the selected system

Preserve real data, permissions, state transitions, URLs, and error handling. Create semantic tokens and reusable primitives before page-by-page styling. Spend visual boldness on the product's distinguishing mechanism and keep supporting surfaces restrained.

### 6. Critique rendered output

Render, screenshot, inspect, revise, and render again. A code build alone is not visual validation.

Review first-glance comprehension, hierarchy, the main action, authentic edge states, desktop and mobile composition, keyboard focus, contrast, reduced motion, touch targets, and signs of generic template output.

Keep an iteration record with the screenshot, concrete defect, change, and outcome. Do not count textual review as a visual iteration.

## Delivery contract

Report:

- selected or proposed visual thesis;
- prototype/artifact paths;
- which capabilities were used and for what;
- verified viewports and flows;
- unresolved product or implementation risks.

Never claim “product-grade” from a build pass, a static mockup, or a checklist alone.
