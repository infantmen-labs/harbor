# Harbor web DESIGN.md

Single source of truth for the dashboard UI. Code tokens live in
`app/globals.css` (`--harbor-*` primitives → Tailwind semantic theme);
everything below is the prose half — where tokens may be used, and what
is forbidden. If a rule here conflicts with code, this file wins: fix
the code. (v0 redesign branch: dark system + hero art documented as
shipped; deviations from the original light spec are marked ACCEPTED
below, not silent.)

## 1. Brand

Developer infrastructure for bonded API payments. Visual character:
dark, exact, auditable — terminal-native. The page should feel like an
explorer transaction rendered as prose — numbers first, adjectives
last. Never playful, never urgent, never glossy.

## 2. Color

Dark neutrals (near-black, cool):

- `background` `#08090b` · `background-secondary` `#0d0f12`
- `surface` `#111419` · `surface-hover` `#181c21`
- `foreground` `#f2f3f0` · `foreground-secondary` `#a6aba8`
- `muted` `#747b78` (body-text floor on dark surfaces)
- `border` `#252a2e` · hairlines + container rules (`border-x` page
  rails, `border-white/[0.08–0.1]` nav/panel lines)
- `foreground` surfaces double as the primary CTA fill (near-white
  buttons on near-black page)

Accent (exactly one): mint `#8fe0c6`, hover `#b8f3df` (lighter on
hover — correct direction on dark).

- Allowed surfaces: text links (ALWAYS underlined), primary CTA hover
  (fill flips accent with ink text), hero grid/glow tints, section
  markers. Pick per viewport, never all at once.
- `success` shares the mint hex. Rule resolving the collision: success
  is never communicated by color alone — always paired with explicit
  copy (`refunded`, `settled`, `+1900`). Danger `#ed8b83` reserved for
  failures and destructive actions; warning amber for grace/deadline
  states only.

Code blocks: ink bg `#050606`, text `#e9eeeb`.

## 3. Typography

Three families, each with one job (data-heavy infra needs tabular
display numerals + a code voice; geometric display keeps 96px
headlines from going corporate):

- Display: Space Grotesk (`font-display`), Medium only — H1/H2, stats,
  card titles. H1 `52px → 84px → 96px`, tracking `-0.045em`,
  line-height `0.94`, max `12ch`. H2 32–40px, tracking `-0.01em`.
- Body: Inter (`font-body`) — everything else, 16px minimum (hero
  16–18px). Line-height `1.5–1.6`. Max measure `48–60ch` prose.
- Mono: JetBrains Mono (`font-mono`) — numbers that must be exact
  (amounts, slots, sigs), labels/eyebrows (12–13px uppercase,
  `tracking 0.08–0.12em`), terminal output. Eyebrows use a rule
  prefix (`—` 8-wide bar + label), not bare text.

Emphasis system: **weight contrast only**. No italics anywhere. No
bold body. No gradient text. Max two weights in use (regular/medium).

## 4. Spacing

4px base. Ramp in use: 8 / 12 / 16 / 24; sections 56–96 (`py-14` /
`py-24`, hero `pt-24` + full-viewport `min-h-[calc(100svh-57px)]`).
Container `max-w-[1280px]`, gutters `px-5` → `md:px-12`, with
`border-x` container rails on the hero. Whitespace is the premium
signal — asymmetric and breathing beats filling every pixel.

## 5. Components

- Hero CTAs: **pills** (`rounded-full`, 48px min-height) — primary
  foreground fill, secondary `border-white/20` on `white/[0.04]`.
  All other buttons: radius 8px. Never two equal-weight filled
  buttons in one viewport.
- Cards: radius 12px, `bg-surface`, hairline border, hover border
  only (no shadow, no scale). Evidence panel: square container,
  `border-white/[0.1]`.
- Pills: full radius, mono 11–13px labels.
- Code/terminal blocks: radius 12px, ink theme, real output only
  (install cmd, snippet, sigs) — never decorative chrome, no macOS dots.
- Nav: sticky, hairline bottom border, mobile collapses links
  (`hidden sm:inline`), CTA shrinks on small screens. KNOWN ISSUE:
  `main overflow-hidden` defeats sticky positioning — fix before this
  ships (remove the overflow or move the nav out of `main`).
- Every interactive element ships 6 states: default / hover / focus /
  active / disabled / loading. Focus: `:focus-visible` 2px ring with
  3:1 contrast, never the browser default. Hover = fill/border/color
  flip only, never scale, never shadow.

## 6. Layout

Full-viewport hero (image art + grid + stat trio anchored bottom),
then single-column narrative at 1280px. Rhythm: section / breath /
section. Alternating band backgrounds separate dense blocks — never
three identical cards in a row; weight must equal importance (rows /
definition lists over equal grids). Footer dense: product links +
contracts + security + status-equivalent, mono 12–13px.

## 7. Voice

Engineer-voice: short verbs, specific nouns, no hedge, no hype.
Headlines state mechanism ("Bonded optimistic refunds for agent API
payments"), never promise ("payments you can trust"). Caveats inline,
plainly — disclosure is a feature. CTAs are verbs of the funnel stage
for infra: install, read the schema, inspect the program. No
"Get Started", no "powered by AI", no urgency ("limited beta" only
with a real number behind it).

## 8. Motion

Zero-JS animation system (pure CSS scroll-driven + keyframes — no
rAF loops, no observers, no motion deps):

- **Scroll reveals** (`.harbor-scroll-reveal`): opacity 0 + 28px rise
  → visible, `animation-timeline: view()`, entry→24% cover. Fires
  once per element by construction (no JS flags to manage). Applied
  per section/container — never per-card grids that would strobe.
- **Hero motion**: looping muted video (`HeroMedia`, poster fallback)
  - 9s grid scanline sweep (`harbor-scan`, 0.35 peak opacity) +
    ambient dot overlay (`body::before`, static 5px grid, masked).
    At most one moving layer draws the eye at a time.
- **Hovers**: color/border transitions 200ms on CTAs and cards. No
  lifts, no spins, no scale — ever.
- Durations: 100ms color, 200ms disclosure/hover, 9s ambient sweep.
  Easing ease-in-out for ambient loops; entrances decelerating, never
  linear.
- **Reduced motion**: `.harbor-scroll-reveal`, grid scan, and video
  (poster instead) all gate off; anchor jumps fall back to instant
  scroll. Decorative layers are `aria-hidden` regardless.

## 9. Imagery

One image total: `public/hero-tree.avif` (dark arboreal render,
1376×768, AVIF q32, 96KB — down from 1.6MB PNG). Served as a
background layer under gradient masks (`harbor-hero-art`), never as
content — decorative, `aria-hidden`, opacity 0.9 desktop / 0.62 mobile
with repositioned crop. Within the 500KB hero ceiling.

## 10. Accepted deviations (from the original light spec)

Recorded, not hidden — each was a deliberate v0 call, kept on merit:

1. **Dark system over light lavender.** Rationale: terminal-native
   audience, code blocks stop inverting, explorer continuity.
2. **Glass nav (`bg-[#030303]/90` + `backdrop-blur-md`).** Original
   spec said solid + hairline. Kept: on near-black with a hairline
   rule it reads solid in practice.
3. **Hero glow + grid + image art.** Original spec forbade decorative
   hero treatments. Kept, bounded: tints use the accent at ≤15%
   opacity, single image, masked; no parallax, no loop, no animation.
4. **Pill hero CTAs vs 8px buttons elsewhere.** Radius-by-role holds
   (pill = hero entry, 8px = everything else).

Still forbidden (unchanged): indigo/violet gradients, pulse/bounce
CTAs, scaling cards on hover, fake proof (every number links to chain
or doesn't ship), mock data presented as live, second filled CTA per
viewport, new fonts/accents without amending this file.

## 11. Anti-patterns (still load-bearing)

1. No indigo/violet `to-br` gradients, anywhere, ever.
2. No `animate-pulse`, no bouncing CTA, no scaling cards on hover.
3. No uniform radius (pill ≠ 8px ≠ 12px ≠ panel).
4. No centered long paragraphs; no 14px body copy.
5. No fake proof: every number links to chain (explorer/tx) or it
   doesn't ship. No round claims, no anonymous quotes, no logo wall.
6. No mock data presented as live: staleness gets an "as of" label,
   always.
7. No second filled CTA competing with the primary per viewport.
8. No new font, no new accent, no new radius without amending this file.
9. No product disconnect: landing tokens = app tokens; a visitor who
   clicks through to explorer/docs must feel continuity, not a theme
   change.
