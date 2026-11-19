// SYSTEM MONOLITH: Scriptor's look (DESIGN.md). The colours are the Flutter app's MonolithTokens, so both apps match.
// Screens read colours and fonts from here, never as literals.

export const colors = {
  background: '#0A0B0E',
  // The top of the backdrop: deep navy, which the ground darkens from (Backdrop.tsx).
  backdropTop: '#0B1426',
  surface: '#13161F',
  elevated: '#1C202D',
  border: '#272E40',
  // A panel's lit edge: blue steel, the colour the backdrop's light catches (the mock-ups' panel outline).
  edge: '#22395F',
  gold: '#F3B63A',
  onGold: '#0A0B0E',
  sky: '#38BDF8',
  text: '#F8FAFC',
  muted: '#94A3B8',
  danger: '#F87171',
  success: '#4ADE80',
  // The two ends of the gold gradient (filled buttons, progress bars, the ink).
  goldLight: '#FFD36B',
  goldDeep: '#C98A12',
} as const;

// The glows (React Native's boxShadow, drawn by Android itself): the soft blue light along a panel's edge, and the
// gold light of what is chosen or acts.
export const glow = {
  sky: '0px 0px 16px 0px rgba(56, 189, 248, 0.20)',
  gold: '0px 0px 18px 1px rgba(243, 182, 58, 0.32)',
  goldSoft: '0px 0px 10px 0px rgba(243, 182, 58, 0.24)',
} as const;

// See-through forms of the colours above, for lines and veils laid over pictures and covers.
export const tints = {
  goldRule: 'rgba(243, 182, 58, 0.45)',
  veil: 'rgba(10, 11, 14, 0.55)',
  // A panel's ground: the surface, a little see-through so the backdrop's light shows faintly behind it.
  panel: 'rgba(17, 21, 33, 0.92)',
  // The same, solid: where a picture fades into a panel.
  panelSolid: 'rgb(17, 21, 33)',
} as const;

// Bundled typefaces (app.json, expo-font). On Android the family is the file's name.
export const fonts = {
  ui: 'Outfit',
  book: 'Merriweather',
  bookItalic: 'Merriweather-Italic',
  display: 'Cinzel',
  numbers: 'JetBrainsMono',
} as const;

export const radius = { panel: 10, chip: 999, field: 8 } as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

// Window size classes, as the Flutter app's: compact < 600 <= medium < 1000 <= expanded.
export type SizeClass = 'compact' | 'medium' | 'expanded';
export function sizeClassOf(width: number): SizeClass {
  if (width < 600) return 'compact';
  if (width < 1000) return 'medium';
  return 'expanded';
}
