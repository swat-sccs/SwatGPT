import { IThemeRGB } from '../types';

/**
 * Dark theme
 * SCCS dark palette (swat-sccs/planner): navy grounds, steel/silver text,
 * SCCS orange accent
 */
export const darkTheme: IThemeRGB = {
  // Text colors
  'rgb-text-primary': '217 217 217', // #d9d9d9 (planner foreground)
  'rgb-text-secondary': '159 173 188', // #9fadbc (planner steel)
  'rgb-text-secondary-alt': '146 154 166', // #929aa6
  'rgb-text-tertiary': '146 154 166', // #929aa6
  'rgb-text-warning': '245 158 11', // #f59e0b (amber-500)
  'rgb-text-destructive': '248 113 113', // #f87171 (red-400)

  // Link and accent colors
  'rgb-link': '96 165 250', // #60a5fa (blue-400)
  'rgb-link-hover': '147 197 253', // #93c5fd (blue-300)
  'rgb-link-visited': '192 132 252', // #c084fc (purple-400)
  'rgb-accent-primary': '244 101 35', // #f46523 (SCCS orange)
  'rgb-accent-primary-hover': '246 128 74', // #f6804a

  // Ring colors
  'rgb-ring-primary': '74 86 106', // #4a566a

  // Header colors
  'rgb-header-primary': '37 46 62', // #252e3e
  'rgb-header-hover': '52 63 82', // #343f52
  'rgb-header-button-hover': '37 46 62', // #252e3e

  // Surface colors
  'rgb-surface-active': '74 86 106', // #4a566a
  'rgb-surface-active-alt': '37 46 62', // #252e3e
  'rgb-surface-hover': '43 53 70', // #2b3546
  'rgb-surface-hover-alt': '52 63 82', // #343f52
  'rgb-surface-composer-hover': '52 63 82', // #343f52
  'rgb-surface-primary': '12 16 25', // #0c1019 (planner background)
  'rgb-surface-primary-alt': '21 29 43', // #151d2b (planner navbar)
  'rgb-surface-primary-contrast': '21 29 43', // #151d2b (planner navbar)
  'rgb-surface-secondary': '26 35 50', // #1a2332
  'rgb-surface-secondary-alt': '26 35 50', // #1a2332
  'rgb-surface-tertiary': '37 46 62', // #252e3e
  'rgb-surface-tertiary-alt': '37 46 62', // #252e3e
  'rgb-surface-dialog': '17 23 34', // #111722
  'rgb-surface-overlay': '0 0 0', // #000 (black)
  'rgb-surface-submit': '244 101 35', // #f46523 (SCCS orange)
  'rgb-surface-submit-hover': '232 84 18', // #e85412
  'rgb-surface-destructive': '153 27 27', // #991b1b (red-800)
  'rgb-surface-destructive-hover': '127 29 29', // #7f1d1d (red-900)
  'rgb-surface-chat': '37 46 62', // #252e3e
  'rgb-surface-inverted': '255 255 255', // #fff (white)
  'rgb-surface-inverted-hover': '217 217 217', // #d9d9d9
  'rgb-text-inverted': '21 29 43', // #151d2b
  'rgb-surface-fixed': '255 253 248', // #fffdf8 (card) — same in light + dark
  'rgb-surface-fixed-hover': '241 235 224', // #f1ebe0 (beige) — same in light + dark
  'rgb-text-fixed': '26 31 46', // #1a1f2e (ink) — same in light + dark

  // Border colors
  'rgb-border-light': '37 46 62', // #252e3e
  'rgb-border-medium': '52 63 82', // #343f52
  'rgb-border-medium-alt': '52 63 82', // #343f52
  'rgb-border-heavy': '74 86 106', // #4a566a
  'rgb-border-xheavy': '146 154 166', // #929aa6
  'rgb-border-destructive': '239 68 68', // #ef4444 (red-500)

  // Status colors
  'rgb-status-success': '110 231 183', // #6ee7b7 (green-300)
  'rgb-status-success-subtle': '2 44 34', // #022c22 (green-950)
  'rgb-status-success-border': '6 95 70', // #065f46 (green-800)
  'rgb-status-success-strong': '6 95 70', // #065f46 (green-800)
  'rgb-status-info': '147 197 253', // #93c5fd (blue-300)
  'rgb-status-info-subtle': '23 37 84', // #172554 (blue-950)
  'rgb-status-info-border': '30 64 175', // #1e40af (blue-800)
  'rgb-status-info-strong': '52 63 82', // #343f52
  'rgb-status-warning': '252 211 77', // #fcd34d (amber-300)
  'rgb-status-warning-subtle': '69 26 3', // #451a03 (amber-950)
  'rgb-status-warning-border': '146 64 14', // #92400e (amber-800)
  'rgb-status-warning-strong': '146 64 14', // #92400e (amber-800)
  'rgb-status-error': '252 165 165', // #fca5a5 (red-300)
  'rgb-status-error-subtle': '69 10 10', // #450a0a (red-950)
  'rgb-status-error-border': '153 27 27', // #991b1b (red-800)
  'rgb-status-error-strong': '153 27 27', // #991b1b (red-800)
  'rgb-status-neutral': '159 173 188', // #9fadbc (planner steel)
  'rgb-status-neutral-subtle': '26 35 50', // #1a2332
  'rgb-status-neutral-border': '37 46 62', // #252e3e
  'rgb-text-on-status': '255 255 255', // #fff (white)

  // Brand colors
  'rgb-brand-purple': '171 104 255', // #ab68ff

  // Presentation
  'rgb-presentation': '26 35 50', // #1a2332
};
