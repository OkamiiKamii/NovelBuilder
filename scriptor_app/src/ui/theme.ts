// SYSTEM MONOLITH: Scriptor's look (DESIGN.md). The colours are the Flutter app's MonolithTokens, so both apps match.
// Screens read colours and fonts from here, never as literals.

export const colors = {
  background: '#0A0B0E',
  surface: '#13161F',
  elevated: '#1C202D',
  border: '#272E40',
  gold: '#F3B63A',
  onGold: '#0A0B0E',
  sky: '#38BDF8',
  text: '#F8FAFC',
  muted: '#94A3B8',
  danger: '#F87171',
  success: '#4ADE80',
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
