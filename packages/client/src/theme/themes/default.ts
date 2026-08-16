import { IThemeRGB } from '../types';

/**
 * Default light theme
 * SCCS "print" palette (swat-sccs/clubs): warm paper grounds, navy ink text,
 * ember-orange accent (AA-compliant on paper)
 */
export const defaultTheme: IThemeRGB = {
  // Text colors
  'rgb-text-primary': '26 31 46', // #1a1f2e (ink)
  'rgb-text-secondary': '68 74 90', // #444a5a
  'rgb-text-secondary-alt': '87 92 106', // #575c6a (muted ink)
  'rgb-text-tertiary': '87 92 106', // #575c6a (muted ink)
  'rgb-text-warning': '180 83 9', // #b45309 (amber-700)
  'rgb-text-destructive': '185 28 28', // #b91c1c (red-700)

  // Link and accent colors
  'rgb-link': '37 99 235', // #2563eb (blue-600)
  'rgb-link-hover': '29 78 216', // #1d4ed8 (blue-700)
  'rgb-link-visited': '147 51 234', // #9333ea (purple-600)
  'rgb-accent-primary': '168 74 18', // #a84a12 (SCCS ember)
  'rgb-accent-primary-hover': '143 62 14', // #8f3e0e

  // Ring colors
  'rgb-ring-primary': '87 92 106', // #575c6a (muted ink)

  // Header colors
  'rgb-header-primary': '255 253 248', // #fffdf8 (card)
  'rgb-header-hover': '250 246 239', // #faf6ef (paper)
  'rgb-header-button-hover': '250 246 239', // #faf6ef (paper)

  // Surface colors
  'rgb-surface-active': '241 235 224', // #f1ebe0 (beige)
  'rgb-surface-active-alt': '232 225 211', // #e8e1d3
  'rgb-surface-hover': '232 225 211', // #e8e1d3
  'rgb-surface-hover-alt': '213 208 196', // #d5d0c4
  'rgb-surface-composer-hover': '232 225 211', // #e8e1d3
  'rgb-surface-primary': '255 253 248', // #fffdf8 (card)
  'rgb-surface-primary-alt': '250 246 239', // #faf6ef (paper)
  'rgb-surface-primary-contrast': '241 235 224', // #f1ebe0 (beige)
  'rgb-surface-secondary': '250 246 239', // #faf6ef (paper)
  'rgb-surface-secondary-alt': '232 225 211', // #e8e1d3
  'rgb-surface-tertiary': '241 235 224', // #f1ebe0 (beige)
  'rgb-surface-tertiary-alt': '255 253 248', // #fffdf8 (card)
  'rgb-surface-dialog': '255 253 248', // #fffdf8 (card)
  'rgb-surface-overlay': '87 92 106', // #575c6a (muted ink)
  'rgb-surface-submit': '168 74 18', // #a84a12 (SCCS ember)
  'rgb-surface-submit-hover': '143 62 14', // #8f3e0e
  'rgb-surface-destructive': '185 28 28', // #b91c1c (red-700)
  'rgb-surface-destructive-hover': '153 27 27', // #991b1b (red-800)
  'rgb-surface-chat': '255 253 248', // #fffdf8 (card)
  'rgb-surface-inverted': '20 24 37', // #141825 (deep ink)
  'rgb-surface-inverted-hover': '49 54 70', // #313646
  'rgb-text-inverted': '255 255 255', // #fff (white)
  'rgb-surface-fixed': '255 253 248', // #fffdf8 (card) — same in light + dark
  'rgb-surface-fixed-hover': '241 235 224', // #f1ebe0 (beige) — same in light + dark
  'rgb-text-fixed': '26 31 46', // #1a1f2e (ink) — same in light + dark

  // Border colors
  'rgb-border-light': '232 225 211', // #e8e1d3
  'rgb-border-medium': '213 208 196', // #d5d0c4
  'rgb-border-medium-alt': '213 208 196', // #d5d0c4
  'rgb-border-heavy': '138 143 156', // #8a8f9c
  'rgb-border-xheavy': '87 92 106', // #575c6a
  'rgb-border-destructive': '220 38 38', // #dc2626 (red-600)

  // Status colors
  'rgb-status-success': '4 120 87', // #047857 (green-700)
  'rgb-status-success-subtle': '236 253 245', // #ecfdf5 (green-50)
  'rgb-status-success-border': '110 231 183', // #6ee7b7 (green-300)
  'rgb-status-success-strong': '2 133 94', // #02855e
  'rgb-status-info': '37 99 235', // #2563eb (blue-600)
  'rgb-status-info-subtle': '239 246 255', // #eff6ff (blue-50)
  'rgb-status-info-border': '147 197 253', // #93c5fd (blue-300)
  'rgb-status-info-strong': '87 92 106', // #575c6a (muted ink)
  'rgb-status-warning': '180 83 9', // #b45309 (amber-700)
  'rgb-status-warning-subtle': '255 251 235', // #fffbeb (amber-50)
  'rgb-status-warning-border': '252 211 77', // #fcd34d (amber-300)
  'rgb-status-warning-strong': '199 82 9', // #c75209
  'rgb-status-error': '185 28 28', // #b91c1c (red-700)
  'rgb-status-error-subtle': '254 242 242', // #fef2f2 (red-50)
  'rgb-status-error-border': '252 165 165', // #fca5a5 (red-300)
  'rgb-status-error-strong': '224 47 31', // #e02f1f
  'rgb-status-neutral': '68 74 90', // #444a5a
  'rgb-status-neutral-subtle': '241 235 224', // #f1ebe0 (beige)
  'rgb-status-neutral-border': '213 208 196', // #d5d0c4
  'rgb-text-on-status': '255 255 255', // #fff (white)

  // Brand colors
  'rgb-brand-purple': '126 34 206', // #7e22ce (purple-700)

  // Presentation
  'rgb-presentation': '255 253 248', // #fffdf8 (card)
};
