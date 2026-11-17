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

## Phase 2 — Shared feature UI

- `PagePanel` / `SectionHeading` in `frontend/src/ui/PagePrimitives.tsx`: small reusable presentation-only React primitives.
- Consolidated headers, fields, buttons, training info and section headings in Training, Tactics, Lessons, Review and Settings.
- The typed feature runtimes still own the identical `data-*` anchors, action events and dynamic HTML.
- Catalog and repeated-action buttons use a neutral treatment; the selected/primary actions retain the existing brand color.
- Replaced non-namespaced layout utilities without matching CSS definitions (e.g. `space-y-6`, complex `lg:grid-cols-[...]`) with explicit, responsive, documented styles.
- A 44px minimum applies to new form inputs and primary/secondary UI buttons. **The live game-action control strip remains untouched pending its own dedicated responsive audit.**
- No modifications to `components/cards.ts`, styles selectors for poker cards, engines, worker or solver outputs.

## Phase 3 — Strategy presentation

- At desktop widths, preflop ranges use a two-column information layout. The matrix remains the exact 169-combination component and retains all data contracts.
- At narrow phone widths, only the matrix has horizontal overflow. Selected-hand detail is announced via a polite live region.
- Range frequency fills preserve the existing green convention and current percentage labels.
- SOLVE strategy frequencies gain a decorative green bar under each action. The original percentage is displayed unchanged; the visual width alone is clamped to a valid 0–100% display interval.
- Mathematical outputs, estimates, confidence intervals and the explicit no-full-game-GTO-certification disclaimer are preserved verbatim.

## CI visual review captures

The V2 validation job optionally saves viewport screenshots to `dist/ui-preview/` when `POKERLAB_CAPTURE_UI=1`. 
Images cover home, training configuration, the ranges explorer and Game Review on Chromium/WebKit, on desktop and mobile viewports.
The dedicated `pokerlab-ui-review` GitHub Actions artifact makes visual inspection possible **without modifying production PWA icons or adding screenshot files to source**.
Screenshots are a review aid, not proof of physical-device Safari performance or complete WCAG compliance.
