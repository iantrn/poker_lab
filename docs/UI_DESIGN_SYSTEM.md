# Poker Lab — Design System, phase 1

Status: **implemented on a feature branch**, pending browser visual review and approval.
Scope: shared shell, homepage, first icon set and reusable visual tokens.
No changes to poker cards, game rules, betting engine, solver, ranges data or math.

## Palette (effective values from the final `:root` declaration in `style.css`)

| Token | Value | Use |
|---|---|---|
| `--bg-dark` | `#111315` | Page background |
| `--bg-surface` | `#1e2327` | Panel/navigation background |
| `--bg-surface-light` | `#292f34` | Active/hover surface |
| `--text-primary` | `#f2f4f5` | Primary text |
| `--text-secondary` | `#b5bdc2` | Description text |
| `--text-muted` | `#899399` | Quiet labels |
| `--accent-red` | `#c93645` | Brand and principal actions |
| `--accent-red-hover` | `#d94755` | Hover/secondary brand |
| `--accent-green` | `#176b4b` | Game/strategic semantics only |
| `--accent-gold` | `#c9ad68` | Selection and focus |
| `--border-subtle` | `rgba(255,255,255,.08)` | Separators |

**Important:** older CSS declarations also exist and are intentionally left intact during incremental migration.
The new `#app`-scoped `--pl-*` aliases refer to those effective tokens rather than redefining their colors.
Semantic colors for folding, calling, raising, all-in and range frequencies remain untouched.

## Geometry

- Spacing: 4 / 8 / 12 / 16 / 24 / 32 px.
- Controls radius: existing 6 px; panel radius: existing 10 px; larger cards: existing 16 px.
- Interactive transitions: color, border and background only, 140 ms; disabled when reduced motion is requested.
- Numerical data should use `font-variant-numeric: tabular-nums` when introduced in specialized modules.
- Keyboard focus must be visible; avoid relying on color alone for selected state.
- Mobile bottom navigation must respect `env(safe-area-inset-bottom)` and preserve main-content clearance.

## Icon geometry and accessibility

- React entrypoint: `frontend/src/ui/PokerLabIcon.tsx`.
- SVG grid `24 × 24`; stroke width `1.75`, round line caps/joins, `currentColor`.
- Icons: `home`, `play`, `tactics`, `learn`, `review`, `settings`, `solve`, `ranges`, `arrow-right`, `reset`.
- Decorative in labeled navigation: SVGs set `aria-hidden` and `focusable=false`.
- Brand mark: `assets/icons/pokerlab-mark.svg`. The existing PWA PNG icons are **not changed** in this phase.

## Guardrails and follow-ups

- Do not modify `frontend/src/components/cards.ts` or CSS selectors beginning with `.pl-card`.
- Preserve `data-page`, `data-module`, `data-training-*`, `data-ranges-viewer` and other legacy-compatible hooks.
- Navigation uses the existing `PokerLabNavigation` hash router.
- Next stages: repeated shell panels/forms, range visualizations, SOLVE dialog and responsive action panel.
- Before merge: CI V2, Chromium/WebKit smoke, manual visual comparisons at 390 / 768 / 1365 px, focus/contrast and iPhone Safari when possible.

## Contrast review (effective colors)

- Primary body text `#f2f4f5` on main red `#c93645`: approximately **4.65:1** (normal-size AA).
- Secondary text `#b5bdc2` on surface `#1e2327`: approximately **8.32:1**.
- Muted text `#899399` on surface `#1e2327`: approximately **5.05:1**.
- Existing brighter red `#d94755` is appropriate for non-text accents on the dark surface but is **not** used for small labels or a hover button background with light text (insufficient contrast).
- Button hover mixes 90% of the existing red with 10% of the existing background, creating a darker tonal variant rather than a new hue.
