# Implementation gates

Read this only when translating an approved direction into production code.

## Before editing

- Identify the authoritative data and permission model.
- Inventory routes, responsive breakpoints, loading/error/empty states, and long-content cases.
- Save a baseline screenshot for visual comparison.
- Confirm whether the chosen concept changes product behavior or only its presentation.

## System before pages

Define semantic tokens for surfaces, text, action, status, focus, typography, spacing, radius, elevation, and motion. Use a small set of primitives for navigation, buttons, fields, overlays, status, evidence, people/agent identity, and work objects.

Avoid installing a component library merely to obtain its default look. Adopt a library only when its interaction primitives or maintenance value justify the dependency, and restyle it to the selected thesis.

## State fidelity

Every visually prominent state must be backed by real application state or explicitly labeled prototype state. Do not:

- show success before the operation succeeds;
- replace user input with a canned example;
- make multiple outcome buttons open the same placeholder;
- expose actions the current role cannot perform;
- imply model learning, confidence, or execution that has not occurred.

## Visual QA matrix

Use realistic data at wide desktop, constrained desktop/tablet, portrait tablet when relevant, and small mobile.

Inspect the primary path, first-use state, long content, errors, permissions, and reduced motion. Verify no horizontal overflow, clipped controls, hidden focus, tiny touch targets, or unreadable scaled text.

## Selection fidelity

Compare final screenshots with the approved concept. If the implementation lost the memorable spatial idea, type hierarchy, or product mechanism, it is not faithful even when all components are functional.
