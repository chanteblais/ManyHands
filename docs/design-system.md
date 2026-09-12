# Design System

---

## Color Palette

> **Tokens (branch 1f, 2026-09-12).** Every colour below is a CSS custom property declared on `:root` in `app/globals.css` and mirrored in `lib/theme.ts` (`THEME_COLORS`). Components use `var(--gold)` (never a hex) and, for alpha, `rgb(var(--gold-rgb) / 0.2)`; the display face is `var(--font-display)`. A community re-skins the site through `communities.theme` — `{ "colors": { "gold": "#…", "ink": "#…" }, "fonts": { "display": "'Fraunces', serif" } }` — which `app/layout.tsx` injects as `:root` overrides. Files that keep literal hexes because their consumers can't resolve CSS variables: `lib/send-email.ts` (mail clients), `app/api/badge/route.tsx` (Satori), the `themeColor` viewport meta in `app/layout.tsx`, `lib/clerk-appearance.ts` (Clerk derives shades), `lib/shift-colors.ts` (deterministic schedule palette), and any `data:` SVG URL.
>
> | Token | Default | Alpha form | Role |
> |---|---|---|---|
> | `--ink` | `#1A0A24` | `--ink-rgb` | Site background |
> | `--plum` / `--plum-dark` | `#5D2B7A` / `#2A0A3A` | `--plum-rgb` | Background gradient |
> | `--gold` | `#C8A848` | `--gold-rgb` | Headings, links, dividers, primary buttons |
> | `--gold-pale` / `--gold-deep` / `--gold-dark` / `--bronze` | `#D4B050` / `#A8882A` / `#634D0B` / `#6F491F` | — | Gold family (text on gold, engraving) |
> | `--purple` | `#D239F8` | `--purple-rgb` | Accent, focus rings, "changed since you looked" |
> | `--lavender` | `#D9B3FF` | — | Soft accent |
> | `--cream` | `#F3EDE6` | `--cream-rgb` | Body text |
> | `--lemon` / `--parchment` / `--paper-ink` | `#FFFACD` / `#EDE0C8` / `#3A2B14` | — | Light surfaces + their text |
> | `--muted` | `#8A8A8A` | — | De-emphasised text |
> | `--danger` / `--danger-strong` / `--danger-soft` | `#FF8A8A` / `#FF8080` / `#FFB4B4` | `--danger-rgb` | Errors, destructive actions |
> | `--warning` / `--amber` | `#FFCF80` / `#FFB432` | — | Cautions, pending states |
> | `--success` | `#7DCF8E` | `--success-rgb` | Confirmations |
> | `--font-display` | `'TokyoDreams', serif` | — | Display face (`.font-tokyo`) |


Defined in `tailwind.config.ts` under `theme.extend.colors.glaum` and used throughout.

| Name | Hex | Tailwind class | Usage |
|---|---|---|---|
| Ink | `#1A0A24` (`var(--ink)`) | `bg-brand-ink` | Site background, base dark |
| Purple | `#D239F8` (`var(--purple)`) | `text-brand-purple` | Accent, focus rings, highlights |
| Gold | `#C8A848` (`var(--gold)`) | `text-brand-gold` | Headings, links, dividers, badges |
| Dark Gold | `#634D0B` | `text-glaum-dark-gold` | Darker gold for contrast |
| Cream | `#FFFACD` | `text-glaum-cream` | High-contrast text on dark |
| Plum | `#5D2B7A` | `bg-glaum-plum` | Mid-tone purple fills |
| Lavender | `#D9B3FF` | `text-glaum-lavender` | Light purple accents |

**Base text color:** `#F3EDE6` (warm off-white — not pure white)  
**Placeholder text:** `rgba(243, 237, 230, 0.28)` (same cream, highly transparent)

### Background

The site shell (`.site-shell` in `globals.css`) layers, bottom to top: base ink color, a purple radial glow at top-center fading out, a subtle plum mid-section linear gradient, and a fixed gold dot-grid via `::before`. Exact gradient stops and opacities live in `globals.css`.

---

## Typography

### Fonts

| Font | Weight | Source | CSS variable / class |
|---|---|---|---|
| TokyoDreams (Plain) | 400 | Local `/fonts/TokyoDreamsPlain.v1.woff2` (OTF master kept beside it) | `font-tokyo` / `font-family: 'TokyoDreams'` |
| TokyoDreams (Bold) | 700 | Local `/fonts/TokyoDreams.v1.woff2` (OTF master kept beside it) | `font-bold font-tokyo` |
| Libre Baskerville | 400/700 | Google Fonts (next/font) | `--font-libre-baskerville` / `font-baskerville` |
| Cormorant Garamond | 400/500/600/700 | Google Fonts (next/font) | `--font-cormorant-garamond` |

Both TokyoDreams faces are `<link rel="preload">`ed in `app/layout.tsx` (they live in the render-blocking stylesheet, so without the preload the LCP heading FOUTs). `/fonts/*` is served immutable — a changed font gets a NEW versioned filename, re-referenced in `globals.css` + the layout preload. Marcellus was dropped 2026-08-27 (loaded globally, used once — that use now renders Cormorant); Cormorant weight 300 was loaded but never used.

**TokyoDreams** is the display/heading font — used for the site name, section headings, and decorative text.  
**Libre Baskerville** is the body serif — used for readable paragraph text.  
**Cormorant Garamond** is the supporting serif used for cards, labels, and sub-headings.

### Heading defaults

Inside `.site-shell`, all `h1`–`h6` default to:
- Color: `#C8A848` (gold)
- Text shadow: `0 2px 8px rgba(0,0,0,0.8)`

Inside `.site-shell .clerk-scope` (Clerk auth embeds), headings reset to dark ink with no shadow to remain legible on Clerk's white card background.

---

## Spacing & Layout

- **Default text color:** white (Tailwind `textColor.DEFAULT`)
- **Container:** centered, with responsive horizontal padding (1rem → 6rem at 2xl)
- **Max page width:** `1100px` (profile page)
- **Border radius:** `2xl` = `1rem`
- **Mobile breakpoint:** `768px` (JS-detected: nav + public schedule calendar), `640px` (personal schedule calendar, CSS media queries)

---

## Reusable CSS Classes

Defined in `globals.css` under `@layer components`:

| Class | What it does |
|---|---|
| `.font-tokyo` | Applies TokyoDreams font family |
| `.shimmer` | Animated shimmer sweep (10s loop, 25% active, 75% paused) |
| `.gold-divider` | 1px horizontal line, gold gradient, 40% opacity |
| `.purple-glow` | Box shadow with layered purple glow |
| `.glass-bar` | Frosted fixed/sticky bars (site header, message-thread header + composer). Desktop (≥769px): `backdrop-filter: blur(12px)` over a translucent ink tint (override via `--glass-bg`). Mobile: **no blur**, near-opaque ink instead (`--glass-bg-mobile`) — a fixed backdrop-filter re-blurs everything behind it on every scroll frame and was the main mobile scroll-lag source. Don't add `backdropFilter` inline to persistent bars; use this class. (Transient surfaces — modals, dropdowns — may still blur inline.) |
| `.site-shell` | Full site wrapper — background, dot grid, base text color |
| `.mobile-stack` | Collapses a hardcoded two-column inline grid (`gridTemplateColumns: '1fr 1fr'`) to one column under 560px (`!important`, since the grids are inline styles). Used by paired form fields (apply wizard, volunteer form, profile settings) and the Your Role / Your Shifts cards. |

### Mobile ergonomics (globals.css, not a class)

- **Form fields are forced to `font-size: 16px` under 768px** (`!important`, overriding inline styles). iOS Safari auto-zooms the page — and leaves it zoomed — when focusing a field styled under 16px; 16px is the threshold that disables that. Don't "fix" a field back down on mobile.
- **`touch-action: manipulation` on interactive elements** (links, buttons, form controls) disables double-tap-to-zoom and its tap delay; pinch-zoom is unaffected.

### Layout classes (profile page, defined inline via `<style>`)

| Class | Purpose |
|---|---|
| `.profile-main-grid` | `1.1fr 1fr` equal-height grid for the Active Commitments + Attunement Status cards |
| `.profile-info-grid` | Info card grid within profile |
| `.profile-header-grid` | `1fr auto 1fr` header band: Designation · portrait · Member Information (stacks under 768px) |
| `.commitments-rows` | Responsive rows in the Commitments card |
| `.commitments-row` | Single commitment row |
| `.commitments-row-text` | Text portion of a commitment row |

---

## Component Patterns

### Cards / Parchment

Most content cards use a parchment aesthetic:
- Background: semi-transparent warm tone or light parchment
- Border: subtle gold or cream at low opacity
- Border radius: `rounded-2xl` (1rem)
- No harsh drop shadows — prefer `purple-glow` or no shadow

### Buttons

- Primary: gold background (`#C8A848` or `glaum-gold`) with dark text
- Secondary/ghost: transparent with gold or cream border
- Focus: `outline: 2px solid #D239F8` (purple), offset 2px, `border-radius: 4px`

### Confirm Dialog

`ConfirmDialog` / `useConfirm()` (`components/ConfirmDialog.tsx`) — in-app replacement for native `confirm()`/`alert()`. Ink card on a dimmed overlay: gold uppercase eyebrow ("✦ A moment of pause"), TokyoDreams title, cream body, pill buttons ("Never mind" ghost + confirm; red accent when `danger`). `notice: true` = single "Understood" button (alert replacement, eyebrow "✦ A small snag"). Promise-based: `const { confirm, confirmDialog } = useConfirm()`, `await confirm({ title, body, confirmLabel, danger })`, render `{confirmDialog}` in the tree. Esc / overlay click cancel. Used everywhere — no native `confirm()`/`alert()` calls remain in the app (delete confirmations name the item and use `danger: true`; error alerts use `notice: true`). The one styled sibling is `ShiftConfirmModal` (shift sign-up/cancel), which predates this component.

### Ornamental hands (page backdrop)

`HandsBackdrop` (`components/HandsBackdrop.tsx`) — the fixed hands framing most pages, one component instead of per-page `<img>` pairs. Props: `opacity` (default `0.85`; message threads use `0.6`). ALL breakpoints render pre-struck WebP rasters (`public/hands-*.v2.webp`, ~145KB the pair, immutable-cached via `next.config.js` `headers()`); the ~750-path SVGs stay in `public/` as editable masters only (they gzip to ~138KB and were re-requested on every navigation). After editing the source SVGs: bump the version in `scripts/raster-hands.mjs` AND `HandsBackdrop`, then `node scripts/raster-hands.mjs`.

### Avatar

- 260px circle
- Gold border: `#6F491F` (darker than the palette gold — richer for the ring)
- Component: `AvatarUpload` (`components/AvatarUpload.tsx`), id=`"avatar-upload"`

### Notification Bell

- Two variants: `NotificationBell` (admin) and `UserNotificationBell` (members)
- Shows unread count badge when > 0
- `UserNotificationBell` deep-links per event type — `new_message` → the sender's DM thread, `group_mention` → the group thread (`/messages/g/[groupId]`)

### Messages Nav Link

`MessagesNavLink` (`components/MessagesNavLink.tsx`) — a special nav link component used in the member nav for Messages. Polls `/api/messages/unread` every 30s and renders an inline unread count badge next to the label when > 0. Used in `HeaderClient` instead of a plain `<a>` tag for that nav item.

### Schedule Calendar

**Public** (`ScheduleCalendarClient`):
- Mobile (< 768px, matching the nav breakpoint): day-tab switcher
- Desktop: 6-column grid
- Event blocks fit content to their slot height (short blocks drop the icon/caret, titles clamp to whole lines — never sliced mid-glyph); tapping a block with detail expands it past its slot over an opaque backing

**Personal** (`PersonalScheduleCalendar`):
- Mobile (< 640px): day-tab switcher
- Desktop: multi-column grid
- `PX_PER_HOUR = 40`

### Event Type Colors

Colours key off `participation_type` + the shift type's palette slot (`lib/shift-colors.ts` — the single source shared by the main schedule, personal schedule, and shift picker):

| Event | Color |
|---|---|
| `general` | A stable hue from `GENERAL_HUES`, hashed from the event id: crimson → chartreuse → moonlight silver → citron. These four bands are the only parts of the wheel not owned by the shift palette + teal + gold/purple chrome, so a general never impersonates a shift type. More than 4 generals will share hues — the escape hatch is a per-event colour picker, not a fifth band |
| `mandatory` | Teal (`MANDATORY_HUE`, the old all-hands colour) |
| `shift` | A hue from `SHIFT_HUES` by the shift type's registry position: ember orange → lake blue → moss green → glåüm magenta → rose pink → gold (cycles). Currently: Decor orange, Setup blue, Teardown green, Service magenta |
| legacy `event_type` text (`'all_hands'`/`'camp_tending'`/`'service'`) | Old hardcoded styles kept as a fallback for undecorated rows |

Per-shift-type configurable colour is a future hook — a colour field on the Shift Types registry would override the palette index.

**Rule:** any surface that colours an event reads `lib/shift-colors.ts` — never a local palette. This is why the main schedule, personal calendar, shift picker, its requirement chips, and its legend all agree.

### Icon rendering — `IconImage`

`components/IconImage.tsx` is **the one way to render icon art** (asset-library icons, group/department icon uploads). All icon assets live on the standard normalized frame (artwork diagonal-normalized, centered on a transparent 1536×1024 canvas — `scripts/normalize-assets.py`); `IconImage` sizes the frame so the artwork fills a square clipping box (`fill`, default `0.82`; `round` clips to a circle). One `fill` value reads as the same optical size for every icon. Don't hand-tune per-surface `<img>` percentages — that's the drift the component exists to end. (The Cabinet of Distinctions keeps its own medal sizing; everything else renders here.)

### Icon & badge registers (pointers)

Two separate visual registers, both specified in `docs/design-philosophy.md` §7 (verdicts 9–10):
- **Icons** — smooth sculpted **regal gold**, no disc, read at a glance. Anchor: `public/asset-library/icons/raised-hand.webp`. New subjects strike via `scripts/strike-icon.py`.
- **Badges (distinction medals)** — warm dimensional embossed gold on a deep aubergine disc, composition-rich. Anchor: `asset-library/distinctions/elder-tree.webp`.

### TimeField

`app/components/TimeField.tsx` — the time input for any HH:MM field (used by ScheduleManager and LeadUpGatheringsManager). New time inputs reuse it rather than raw `<input type="time">`, so time entry behaves the same everywhere.

### Page ornament — the hands margins

Registry-flavoured pages (profile, Many Hands, messages, the admin tabs, volunteer form, track picker) carry the engraved hands margin art through the shared `HandsBackdrop` component (see Component patterns above — versioned WebP rasters, immutable-cached; the SVGs are editable masters only): full height, `opacity: 0.85` (message threads `0.6`), `pointer-events: none`, `z-index: 0`. The per-page duplication ux-review-log finding 22 called out was resolved 2026-07-09; a theme-layer `<PageOrnament />` swap remains the multi-community follow-up (generalizability log).

### Department Icons

The `icon` field on `departments` accepts:
- **Emoji** — rendered as text
- **Image path** (starts with `/`) — rendered via `IconImage` everywhere: admin UI, profile, SignupSection, CommitmentsSection

---

## Accessibility

- `prefers-reduced-motion` — all animations and transitions disabled
- Focus rings — consistent purple outline on all interactive elements
- Clerk embed overrides — heading color + text-shadow reset inside `.clerk-scope` to preserve Clerk's own accessible contrast
