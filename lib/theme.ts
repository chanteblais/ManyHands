// Theme tokens (docs/tenancy-design.md §8 row 1f; docs/design-system.md).
//
// Every brand/semantic colour in the UI is a CSS custom property declared in
// app/globals.css (`:root`) and consumed inline as `var(--gold)` or, with
// alpha, `rgb(var(--gold-rgb) / 0.2)`. A community re-skins the site by
// overriding those properties: `communities.theme.colors` holds `{ token: hex }`
// and the root layout injects the overrides as a `<style>` on `:root`, so the
// whole app repaints without touching a component.
//
// KEEP IN SYNC with the `:root` block in app/globals.css — the defaults below
// are the Glåüm palette and exist so a partial override still resolves every
// `-rgb` triplet consistently.

export type ThemeToken = {
  /** CSS custom property name without the leading dashes. */
  css: string
  /** Default hex (the Glåüm palette). */
  hex: string
  /** Also emit `--<css>-rgb: r g b` (used by alpha variants). */
  rgb: boolean
}

export const THEME_COLORS: Record<string, ThemeToken> = {
  ink: { css: 'ink', hex: '#1A0A24', rgb: true },            // site background
  'ink-deep': { css: 'ink-deep', hex: '#130820', rgb: false },
  plum: { css: 'plum', hex: '#5D2B7A', rgb: true },          // background gradient
  'plum-dark': { css: 'plum-dark', hex: '#2A0A3A', rgb: false },
  gold: { css: 'gold', hex: '#C8A848', rgb: true },          // headings, links, dividers
  'gold-pale': { css: 'gold-pale', hex: '#D4B050', rgb: false },
  'gold-deep': { css: 'gold-deep', hex: '#A8882A', rgb: false },
  'gold-dark': { css: 'gold-dark', hex: '#634D0B', rgb: false }, // dark text on gold
  bronze: { css: 'bronze', hex: '#6F491F', rgb: false },
  purple: { css: 'purple', hex: '#D239F8', rgb: true },      // accent, focus, "changed"
  lavender: { css: 'lavender', hex: '#D9B3FF', rgb: false },
  cream: { css: 'cream', hex: '#F3EDE6', rgb: true },        // body text
  lemon: { css: 'lemon', hex: '#FFFACD', rgb: false },
  parchment: { css: 'parchment', hex: '#EDE0C8', rgb: false },
  'paper-ink': { css: 'paper-ink', hex: '#3A2B14', rgb: false }, // text on parchment
  muted: { css: 'muted', hex: '#8A8A8A', rgb: false },
  danger: { css: 'danger', hex: '#FF8A8A', rgb: true },
  'danger-strong': { css: 'danger-strong', hex: '#FF8080', rgb: false },
  'danger-soft': { css: 'danger-soft', hex: '#FFB4B4', rgb: false },
  warning: { css: 'warning', hex: '#FFCF80', rgb: false },
  amber: { css: 'amber', hex: '#FFB432', rgb: false },
  success: { css: 'success', hex: '#7DCF8E', rgb: true },
}

export const THEME_FONTS: Record<string, { css: string; stack: string }> = {
  // The display face; TokyoDreams is loaded by @font-face in globals.css.
  display: { css: 'font-display', stack: "'TokyoDreams', serif" },
}

const HEX = /^#([0-9a-f]{6})$/i

export function hexToRgbTriplet(hex: string): string | null {
  const m = HEX.exec(hex.trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`
}

/** The `:root` declarations for a full palette (used to render the defaults and to sanity-check globals.css). */
export function themeDeclarations(colors: Record<string, string> = {}): string[] {
  const out: string[] = []
  for (const [key, token] of Object.entries(THEME_COLORS)) {
    const hex = HEX.test(colors[key] ?? '') ? colors[key] : token.hex
    out.push(`--${token.css}: ${hex};`)
    if (token.rgb) out.push(`--${token.css}-rgb: ${hexToRgbTriplet(hex)};`)
  }
  return out
}

/**
 * CSS overriding only the tokens a community's theme sets, or null when it
 * sets none. `theme` is `communities.theme` — `{ colors?: { gold: '#…' },
 * fonts?: { display: "'Fraunces', serif" } }`. Unknown keys and invalid values
 * are ignored, so a bad theme row can never break rendering.
 */
export function themeOverrideCss(theme: Record<string, unknown>): string | null {
  const colors = (theme.colors && typeof theme.colors === 'object' ? theme.colors : {}) as Record<string, unknown>
  const fonts = (theme.fonts && typeof theme.fonts === 'object' ? theme.fonts : {}) as Record<string, unknown>
  const decl: string[] = []
  for (const [key, token] of Object.entries(THEME_COLORS)) {
    const v = colors[key]
    if (typeof v !== 'string' || !HEX.test(v.trim())) continue
    decl.push(`--${token.css}: ${v.trim()};`)
    if (token.rgb) decl.push(`--${token.css}-rgb: ${hexToRgbTriplet(v)};`)
  }
  for (const [key, font] of Object.entries(THEME_FONTS)) {
    const v = fonts[key]
    // A font stack: letters, digits, spaces, quotes, commas, hyphens only.
    if (typeof v !== 'string' || !/^[\w\s'",-]{1,120}$/.test(v)) continue
    decl.push(`--${font.css}: ${v.trim()};`)
  }
  return decl.length ? `:root{${decl.join('')}}` : null
}

// ── Brand strings ────────────────────────────────────────────────────────────
// `communities.theme.brand` holds the per-community copy that used to be
// hardcoded Glåüm branding (the header sub-line, the hero image, the kicker
// under the event name, the footer). Every field is optional; absent = hidden.
//   { tagline: "sponsored by Shrimp™", kicker: "Theme Camp",
//     hero_image: "/glaum-camp.jpg" | "https://…", footer_line: "…",
//     footer_link: { label: "Glåüm collective", href: "https://glaum.ca" } }
export type ThemeBrand = {
  tagline: string | null
  kicker: string | null
  heroImage: string | null
  footerLine: string | null
  footerLink: { label: string; href: string } | null
}

const text = (v: unknown, max = 160): string | null =>
  typeof v === 'string' && v.trim() && v.trim().length <= max ? v.trim() : null

export function themeBrand(theme: Record<string, unknown> | undefined): ThemeBrand {
  const b = (theme?.brand && typeof theme.brand === 'object' ? theme.brand : {}) as Record<string, unknown>
  const hero = text(b.hero_image, 500)
  const link = b.footer_link && typeof b.footer_link === 'object' ? (b.footer_link as Record<string, unknown>) : null
  const href = link ? text(link.href, 500) : null
  return {
    tagline: text(b.tagline),
    kicker: text(b.kicker, 60),
    heroImage: hero && (hero.startsWith('/') || hero.startsWith('https://')) ? hero : null,
    footerLine: text(b.footer_line, 200),
    footerLink: link && href && href.startsWith('https://') && text(link.label) ? { label: text(link.label)!, href } : null,
  }
}
