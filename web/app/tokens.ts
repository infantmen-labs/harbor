/**
 * Design tokens — single source of truth (see design-system.md §3).
 * Raw ramps stay here; Tailwind utilities consume the CSS variables
 * declared in globals.css (@theme). Never scatter hex values elsewhere.
 */
export const colors = {
  background: "#F5F5FA",
  backgroundSecondary: "#FFFFFF",
  surface: "#FFFFFF",
  surfaceHover: "#F0F0F6",
  foreground: "#101014",
  foregroundSecondary: "#373642",
  muted: "#626070",
  border: "#D9D8E3",
  borderSubtle: "#E7E6EE",
  accent: "#0F9D7E",
  accentHover: "#0B7D64",
  success: "#0F9D7E",
  warning: "#D99B00",
  warningBg: "#FFF2CF",
  error: "#C93A2E",
  errorBg: "#FDECEA",
  inkInverse: "#E6EDF3",
  inkBg: "#101014",
} as const;

/** Ledger-state color mapping — global rule, used everywhere. */
export const stateColor = {
  bonded: "accent",
  verified: "accent",
  pending: "warning",
  maturing: "warning",
  slashed: "error",
  failed: "error",
  halted: "error",
  neutral: "muted",
} as const;

export const radius = {
  input: 4,
  button: 8,
  card: 12,
  hero: 16,
  pill: 9999,
} as const;

export const spacing = [
  0, 4, 8, 12, 16, 20, 24, 32, 48, 64, 96, 128, 160,
] as const;

export const layout = {
  maxWidth: 1280,
  maxWidthWide: 1440,
  gutterMobile: 20,
  gutterDesktop: 32,
  sectionMobile: 96,
  sectionDesktop: 144,
} as const;

export const fonts = {
  display: "Space Grotesk",
  body: "Inter",
  mono: "JetBrains Mono",
} as const;
