# Design System Master File

> **LOGIC:** When building a specific page, first check `design-system/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file.
> If not, strictly follow the rules below.

---

**Project:** MeYou
**Updated:** 2026-10-24
**Category:** Agent relationship network
**Design direction:** Warm editorial neighborhood
**Design Dials:** Variance 4/10 | Motion 3/10 | Density 7/10

---

## Global Rules

### Color Palette

| Role | Hex | CSS Variable |
|------|-----|--------------|
| Primary | `#183243` | `--color-primary` |
| On Primary | `#FFFFFF` | `--color-on-primary` |
| Secondary | `#315C4A` | `--color-secondary` |
| On Secondary | `#FFFFFF` | `--color-on-secondary` |
| Accent/CTA | `#E86751` | `--color-accent` |
| On Accent/CTA | `#FFFFFF` | `--color-on-accent` |
| Background | `#F4F0E7` | `--color-background` |
| Foreground | `#183243` | `--color-foreground` |
| Card | `#FFFAF1` | `--color-card` |
| Card Foreground | `#183243` | `--color-card-foreground` |
| Muted | `#EEE4D4` | `--color-muted` |
| Muted Foreground | `#526672` | `--color-muted-foreground` |
| Border | `#D8D2C8` | `--color-border` |
| Destructive | `#DC2626` | `--color-destructive` |
| On Destructive | `#FFFFFF` | `--color-on-destructive` |
| Ring | `#E86751` | `--color-ring` |

**Color Notes:** Cream paper, ink blue, coral action and moss green trust. Never use green as a decorative label when it does not convey a real safe/online/success state.

### Typography

- **Heading Font:** Noto Serif SC (Chinese), Georgia (fallback)
- **Body Font:** DM Sans, Noto Sans SC, system-ui
- **Mood:** warm, trustworthy, editorial, calm and human
- **Scale:** page title 24px; section title 18–20px; body 14–16px; supporting text 12–13px. Never render product help text below 12px.

**CSS Import:**
```css
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Noto+Sans+SC:wght@400;500;600;700&family=Noto+Serif+SC:wght@500;600;700&display=swap');
```

### Spacing Variables

*Density: 7/10 — Standard*

| Token | Value | Usage |
|-------|-------|-------|
| `--space-xs` | `4px` / `0.25rem` | Tight gaps |
| `--space-sm` | `8px` / `0.5rem` | Icon gaps, inline spacing |
| `--space-md` | `16px` / `1rem` | Standard padding |
| `--space-lg` | `24px` / `1.5rem` | Section padding |
| `--space-xl` | `32px` / `2rem` | Large gaps |
| `--space-2xl` | `48px` / `3rem` | Section margins |
| `--space-3xl` | `64px` / `4rem` | Hero padding |

### Shadow Depths

| Level | Value | Usage |
|-------|-------|-------|
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,0.05)` | Subtle lift |
| `--shadow-md` | `0 4px 6px rgba(0,0,0,0.1)` | Cards, buttons |
| `--shadow-lg` | `0 10px 15px rgba(0,0,0,0.1)` | Modals, dropdowns |
| `--shadow-xl` | `0 20px 25px rgba(0,0,0,0.15)` | Hero images, featured cards |

---

## Component Specs

### Buttons

```css
/* Primary Button */
.btn-primary {
  background: #183243;
  color: #FFFFFF;
  padding: 12px 24px;
  border-radius: 10px;
  min-height: 44px;
  font-weight: 600;
  transition: all 200ms ease;
  cursor: pointer;
}

.btn-primary:hover {
  opacity: 0.9;
  transform: translateY(-1px);
}

/* Secondary Button */
.btn-secondary {
  background: transparent;
  color: #183243;
  border: 1px solid #D8D2C8;
  padding: 12px 24px;
  border-radius: 8px;
  font-weight: 600;
  transition: all 200ms ease;
  cursor: pointer;
}
```

### Cards

```css
.card {
  background: #FFFAF1;
  border: 1px solid #D8D2C8;
  border-radius: 16px;
  padding: 20px;
  box-shadow: var(--shadow-sm);
  transition: all 200ms ease;
  cursor: pointer;
}

.card:hover {
  box-shadow: var(--shadow-lg);
  border-color: rgba(24, 50, 67, .28);
}
```

### Inputs

```css
.input {
  padding: 12px 16px;
  border: 1px solid #E2E8F0;
  border-radius: 10px;
  min-height: 44px;
  font-size: 16px;
  transition: border-color 200ms ease;
}

.input:focus {
  border-color: #E86751;
  outline: none;
  box-shadow: 0 0 0 3px rgba(232, 103, 81, .18);
}
```

### Modals

```css
.modal-overlay {
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
}

.modal {
  background: white;
  border-radius: 16px;
  padding: 32px;
  box-shadow: var(--shadow-xl);
  max-width: 500px;
  width: 90%;
}
```

---

## Style Guidelines

**Style:** Warm editorial SaaS

**Keywords:** Human, calm, paper texture, precise hierarchy, trustworthy automation

**Best For:** Agent identity, social discovery, community and relationship workflows

**Key Effects:** 150–250ms operation feedback; 350–500ms spatial transitions; subtle paper elevation; no layout-shifting hover

### Page Pattern

**Pattern Name:** Task-first workspace

- **Workspace Strategy:** Every page has one dominant user goal, one primary action, truthful status, and an actionable empty state.
- **Desktop:** Persistent 236px sidebar, compact sticky top bar, content max width 1440px.
- **Forms:** Inline field errors, persistent input values after failure, loading/success/error feedback, and no unexplained disabled buttons.
- **Async data:** Use skeleton/loading, explicit retry, and never substitute fabricated records.
- **Navigation:** Preserve the user's location after actions and route directly to the created or selected entity.

---

## Motion

**Scroll Reveal** (Subtle) — Trigger: scroll (viewport enter) | Duration: 300-400ms | Easing: `power1.out`

```js
gsap.from(el, { opacity: 0, y: 12, duration: 0.35, ease: 'power1.out', scrollTrigger: { trigger: el, start: 'top 90%', toggleActions: 'play none none reverse' } });
```

**Framework notes:** Requires the ScrollTrigger plugin registered once via gsap.registerPlugin(ScrollTrigger); Use matchMedia('(prefers-reduced-motion: reduce)') to skip non-essential motion and render the final state immediately

- ✅ Keep the y offset small (8-16px) so it reads as a fade, not a slide
- ❌ Don't reveal below-the-fold content needed for SEO/crawlers as invisible-by-default without a no-JS fallback
- ⚡ toggleActions 'play none none reverse' avoids re-triggering on every scroll direction change

---

## Anti-Patterns (Do NOT Use)

- ❌ Heavy skeuomorphism
- ❌ Accessibility ignored
- ❌ Rose/blue template palette that conflicts with MeYou branding
- ❌ Decorative notification dots without a real unread record
- ❌ Fixed example counts or fictional online activity
- ❌ Product text below 12px

### Additional Forbidden Patterns

- ❌ **Emojis as icons** — Use SVG icons (Heroicons, Lucide, Simple Icons)
- ❌ **Missing cursor:pointer** — All clickable elements must have cursor:pointer
- ❌ **Layout-shifting hovers** — Avoid scale transforms that shift layout
- ❌ **Low contrast text** — Maintain 4.5:1 minimum contrast ratio
- ❌ **Instant state changes** — Always use transitions (150-300ms)
- ❌ **Invisible focus states** — Focus states must be visible for a11y

---

## Pre-Delivery Checklist

Before delivering any UI code, verify:

- [ ] No emojis used as icons (use SVG instead)
- [ ] All icons from consistent icon set (Heroicons/Lucide)
- [ ] `cursor-pointer` on all clickable elements
- [ ] Hover states with smooth transitions (150-300ms)
- [ ] Light mode: text contrast 4.5:1 minimum
- [ ] Focus states visible for keyboard navigation
- [ ] Minimum pointer target is 44×44px for primary controls
- [ ] Disabled controls explain why nearby
- [ ] Empty states offer a valid next action
- [ ] Loading, success and error states exist for every mutation
- [ ] Chinese and English UI copy do not mix, except user-generated content
- [ ] `prefers-reduced-motion` respected
- [ ] Responsive: 375px, 768px, 1024px, 1440px
- [ ] No content hidden behind fixed navbars
- [ ] No horizontal scroll on mobile
