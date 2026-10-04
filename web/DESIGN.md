# Harbor web DESIGN.md

Single source of truth for the dashboard UI. Code tokens live in
`app/globals.css` (`--harbor-*` primitives → Tailwind semantic theme);
everything below is the prose half — where tokens may be used, and what
is forbidden. If a rule here conflicts with code, this file wins: fix
the code.

## 1. Brand

Developer infrastructure for bonded API payments. Visual character:
restrained, exact, auditable. The page should feel like an explorer
transaction rendered as prose — numbers first, adjectives last. Never
playful, never urgent, never glossy.

## 2. Color

Neutrals (cool temperature — lavender-gray, not warm cream):

- `background` `#f5f5fa` · `surface` `#ffffff` · `surface-hover` `#f0f0f6`
- `foreground` `#101014` · `foreground-secondary` `#373642`
  (10.92:1 on bg ✓)
- `muted` `#626070` (5.64:1 on bg ✓ — body-text floor, never below)
- `border` `#d9d8e3` · hairlines only, never shadow-lifted cards

Accent (exactly one): teal `#0f9d7e`, hover `#0b7d64`.

- Allowed surfaces: text links (ALWAYS underlined — teal-on-bg is
  3.14:1, underline carries the affordance), primary CTA fill, section
  markers. Pick per viewport, never all three.
- `success` shares the teal hex. Rule resolving the collision: success
  is never communicated by color alone — always paired with explicit
  copy (`refunded`, `settled`, `+1900`). Danger `#c93a2e` reserved for
  failures and destructive actions; warning amber for grace/deadline
  states only.

Code blocks invert: ink bg `#101014`, text `#e6edf3` (16.07:1 ✓).

## 3. Typography

Three families, each with one job (documented justification: data-heavy
infra needs tabular display numerals + a code voice; geometric display
keeps 88px headlines from going corporate-Inter):

- Display: Space Grotesk (`font-display`) — H1/H2, stats, card titles.
  Medium only. H1 `clamp(48px, 5vw, 88px)`, tracking `-0.02em`,
  line-height `1.0`. H2 32–40px, tracking `-0.01em`.
- Body: Inter (`font-body`) — everything else, 16px minimum (hero
  17–18px). Line-height `1.5`. Max measure `52–60ch` prose.
- Mono: JetBrains Mono (`font-mono`) — numbers that must be exact
  (amounts, slots, sigs), labels/eyebrows (13px uppercase
  `tracking 0.04em`), terminal output. Tabular figures everywhere
  numbers appear.

Emphasis system: **weight contrast only**. No italics anywhere (0 on
the page today — keep it 0). No bold body. No gradient text. Max two
weights in use (regular/medium + display medium).

## 4. Spacing

4px base. Ramp in use: 8 / 12 / 16 / 24; sections 64 / 96
(`py-16`/`py-24`, hero `pt-20–28`). Container `max-w-[1280px]`,
gutters `px-5` → `md:px-8`. Never a 32px section. Whitespace is the
premium signal — asymmetric and breathing beats filling every pixel.

## 5. Components

- Buttons: radius 8px. Primary = foreground fill; secondary = bordered
  ghost. Never two equal-weight filled buttons in one viewport.
- Cards: radius 12px, `bg-surface`, hairline border. Large panel: 16px
  (single instance per page max). No shadows anywhere.
- Pills: full radius, mono 13px labels.
- Code/terminal blocks: radius 12px, ink theme, real output only
  (install cmd, snippet, sigs) — never decorative chrome, no macOS dots.
- Every interactive element ships 6 states: default / hover / focus /
  active / disabled / loading. Focus: `:focus-visible` 2px ring with
  3:1 contrast, never the browser default. Hover = border/color only,
  never scale, never shadow.

## 6. Layout

Single-column narrative, 1280px container. Rhythm: section / breath /
section. Alternating band backgrounds (`background-secondary` hairline
bands) separate dense blocks — never three identical cards in a row;
weight must equal importance (bento / definition list / 5fr-3fr split
over equal grids). Footer dense (Vercel pattern): product links +
contracts + security + status-equivalent, mono 13px.

## 7. Voice

Engineer-voice: short verbs, specific nouns, no hedge, no hype.
Headlines state mechanism ("Bonded optimistic refunds for agent API
payments", 7 words), never promise ("payments you can trust").
Caveats inline, plainly ("the bond covers the rebate leg, not the
payment leg") — disclosure is a feature. CTAs are verbs of the
funnel stage for infra: install, read the schema, inspect the program.
No "Get Started", no "powered by AI", no urgency ("limited beta" only
with a real number behind it).

## 8. Motion

Quiet to the point of stillness. Hero renders instantly — no entrance
delay, no delay chains. At most one `useInView`-once sequence per page
(chapters block); entrances vary by section or don't exist. Durations:
100ms color, 200ms disclosure, 500ms max. Easing
`cubic-bezier(0.16, 1, 0.3, 1)`, never linear entrances. Everything
non-essential gated behind `prefers-reduced-motion`. Dead keyframes
(`harbor-fade-in`, `harbor-pulse`) were removed with the feed UI and
must not be re-added without a use.
Forbidden: parallax on copy, looping hero, pulse/bounce CTAs,
fade-up on every section, motion that blocks interaction.

## 9. Anti-patterns (most load-bearing section)

1. No indigo/violet `to-br` gradients, anywhere, ever.
2. No glass nav (`backdrop-blur` + opacity). Solid + hairline.
3. No `animate-pulse`, no bouncing CTA, no scaling cards on hover.
4. No uniform radius (8 ≠ 12 ≠ 16; pills full).
5. No centered long paragraphs; no 14px body copy.
6. No fake proof: every number links to chain (explorer/tx) or it
   doesn't ship. No round claims, no anonymous quotes, no logo wall.
7. No mock data presented as live: staleness gets an "as of" label,
   always.
8. No second filled CTA competing with the primary per viewport.
9. No new font, no new accent, no new radius without amending this file.
10. No product disconnect: landing tokens = app tokens; a visitor who
    clicks through to explorer/docs must feel continuity, not a theme
    change.
