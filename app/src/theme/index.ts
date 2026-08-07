/**
 * Kokum design tokens. Route B, "Deep water". See ../../../DECISIONS.md D-003.
 *
 * Rule: green and amber belong to the dish-state system only. Never use them
 * decoratively, or state stops being readable at a glance.
 */

export const color = {
  // surfaces
  canvas: '#EEF2F0',
  card: '#FFFFFF',
  sunken: '#E1E9E6',
  tile: '#F4F8F7',

  // brand
  petrol: '#0E5A50',
  petrolDeep: '#08403A',
  petrolPale: '#BEDBD4',
  petrolWash: '#D6E8E4',
  onPetrol: '#FFFFFF',

  // text
  ink: '#12211E',
  inkSoft: '#3A4E4A',
  muted: '#67807A',

  // lines
  line: '#CFDCD8',
  lineSoft: '#E0E9E6',

  // dish state. Semantic only.
  stateCook: '#2F7D51',
  stateCookWash: '#E4F1E9',
  stateNeed: '#B4720F',
  stateNeedWash: '#FAEEDB',
  stateCheck: '#67807A',
  stateCheckWash: '#E7EDEB',
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 14,
  lg: 20,
  pill: 999,
} as const;

/** One shadow tier only. Depth comes from surface separation, not a ladder. */
export const shadow = {
  card: {
    shadowColor: '#092824',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
} as const;

export const type = {
  display: { fontSize: 27, fontWeight: '600' as const, letterSpacing: -0.5, lineHeight: 32 },
  title: { fontSize: 19, fontWeight: '600' as const, letterSpacing: -0.3, lineHeight: 24 },
  subtitle: { fontSize: 16, fontWeight: '600' as const, letterSpacing: -0.2, lineHeight: 21 },
  body: { fontSize: 15, fontWeight: '400' as const, lineHeight: 21 },
  small: { fontSize: 13, fontWeight: '400' as const, lineHeight: 18 },
  /** Quantities and counts. Route B leans on numerals for hierarchy. */
  numeral: { fontSize: 16, fontWeight: '700' as const, letterSpacing: -0.2 },
  label: { fontSize: 11, fontWeight: '700' as const, letterSpacing: 1.1 },
} as const;

/** Minimum tap target. Kitchen use, one hand, sometimes wet. */
export const TOUCH_MIN = 48;
export const TOUCH_PRIMARY = 56;
