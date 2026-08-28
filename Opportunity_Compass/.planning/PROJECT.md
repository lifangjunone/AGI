# Opportunity Compass

## What This Is

Opportunity Compass is a personal macOS opportunity intelligence desk. It consumes the local daily reports produced by Technology Exploration Agent and turns broad technology and market signals into one to three concrete, evidence-backed opportunities that can be tested and sold.

## Core Value

Every day, surface no more than three opportunities that fit the user's team capacity and provide an executable path from evidence to real profit.

## Previous Milestone: v1.1 Solo Business Loop

**Goal:** Turn a one-person opportunity into a controlled, measurable path through validation, development, launch, promotion, payment, and repeatable profit.

**Target features:**
- Distinguish opportunity fit, investment, scope, and timing for solo, 2-5 person, and 6-20 person teams.
- Default to a solo-founder profile with strict scope and cash constraints.
- Provide a seven-stage operating workflow with tasks, gates, and progress.
- Track actual spend, revenue, leads, customers, profit, ROI, and conversion locally.

## Current Milestone: v1.2 Autonomous Opportunity Factory

**Goal:** Run continuously without operator participation: discover explicit demand, decide whether to sell delivery or build a reusable product, launch it, promote it through permitted channels, and measure real demand.

**Target features:**
- Own demand sources independent of Technology Exploration.
- Continuous GitHub Issues and Hacker News collection with local deduplication.
- Separate paid delivery leads from repeated problems suitable for a public product.
- Automatically generate and publish a functional micro-product with lead capture, RSS, and sitemap.
- Queue or dispatch transparent, rate-limited outreach only where platform permission and credentials exist.
- Run as a restartable macOS LaunchAgent and Linux systemd service.
- Deploy behind HTTPS at `lifeyoume.icu`.

## Requirements

### Validated

- Read Technology Exploration reports without copying credentials - v1.
- Generate one to three daily opportunities with explicit evidence and rejection rules - v1.
- Show buyer, offer, pricing hypothesis, channel, risks, and a seven-day validation plan - v1.
- Preserve opportunity history, status, and private notes locally - v1.
- Run as a signed native macOS application with daily LaunchAgent scheduling - v1.

### Active

- [ ] Enable a dedicated outreach identity/token after deployment.
- [ ] Measure the first real lead and payment.

### Out of Scope

- Automatic investment or purchasing decisions - the app provides evidence and experiments, not financial advice.
- Claims of guaranteed revenue - opportunities remain hypotheses until a customer pays.
- Cloud account system - this is a private local-first tool.

## Context

- Upstream reports live in `~/Library/Application Support/Technology Exploration Agent/reports/`.
- Available sources include GitHub, Hacker News, Product Hunt, Reddit, Chinese trend boards, YouTube, X, arXiv, and market/news aggregators.
- Competitor research covered Exploding Topics, Trend Hunter, CB Insights, G2, Product Hunt, and Reddit pain discovery workflows.
- The product must avoid presenting popularity, search growth, or AI buzz as proof of willingness to pay.

## Constraints

- **Privacy**: All data and state remain on this Mac.
- **Dependencies**: Use macOS system frameworks and Python standard library only.
- **Truthfulness**: Every recommendation exposes its evidence and falsification conditions.
- **Volume**: The daily output is capped at three opportunities.
- **Solo default**: The default recommendation must be feasible for one person to launch within 30 days.
- **Accessibility**: Motion respects the macOS Reduce Motion setting.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Use Technology Exploration report JSON as the source contract | Reuses the existing collection system and local credentials | ✓ Good |
| Use hard gates before ranking | Prevents attractive but non-actionable trend cards | ✓ Good |
| Build a native Cocoa/WebKit shell | Matches the existing desktop stack without third-party runtime dependencies | ✓ Good |
| Keep user status in local app storage | Supports a private personal workflow | ✓ Good |
| Default to one-person capacity | Prevents recommending opportunities that require an unavailable team | — Pending |
| Use stage gates from opportunity to profit | Makes progress observable and stops premature development | — Pending |
| Separate delivery leads from product clusters | One request can justify contact, but not a reusable product | ✓ Good |
| Require three independent authors before product generation | Prevents automated production of demand-free products | ✓ Good |
| Keep outreach disabled until a dedicated token is configured | Prevents accidental posting from a personal account | ✓ Good |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition:**
1. Move validated requirements to Validated with a phase reference.
2. Move rejected requirements to Out of Scope with a reason.
3. Record new decisions and requirements.
4. Recheck that the Core Value still drives prioritization.

---
*Last updated: 2026-08-18 after v1.2 public deployment*
