# Glåüm Design Philosophy

*v1.0 — VALIDATED · 2026-07-02 · distilled from Chanterelle's reactions across the icon-lab
rounds, the resonance-gathering board (`design/resonance-gathering/`), the Salon emblem and
badge art, and glaum.ca. Naming session complete (§7); **falsification test passed 8/8** —
her blind sort of eight specimens (four obedient, four single-principle violations) matched
the sealed predictions exactly. This document predicts her taste; trust it.*

---

## 1. One spirit, two faces

Glåüm speaks in two registers, and both are canon:

- **The daylight face** (glaum.ca): violet kitsch, retro-suburbia sincerity, deadpan
  cult-parody — "Trust is the first step toward attunement." The wink.
- **The night face** (glaum.withmanyhands.ca, formerly camp.glaum.ca): ink and antique gold, engraved ceremony, the registry.
  The candlelight.

They are not in conflict; the joke *is* the sincerity. Under the shrimp-jello surrealism sit
six earnest tenets about community, reciprocity, and shared responsibility. Design for either
face must remember the other exists: the ceremony never becomes pompous (the daylight face is
watching), and the kitsch never becomes cynical (the night face is watching). This is what
**silly-sacred** means in practice.

## 2. The trinity: triangle, eye, hands

The logo — a feminine eye inside a triangle, crowned with rays — is not decoration; it's a
diagram of the whole system:

| Symbol | Meaning | In the app |
|---|---|---|
| **Triangle** | The container. Structure that holds people safely — the frame, the tent, the order of things. | Structure & configuration: collections, departments, forms, the shapes that hold content. Geometry, frames, layout. |
| **Eye** | The witness. Feminine, awake, kind — to see and be seen. Attunement is being witnessed. | Observation surfaces: Overview, the registry/profile (a member's page is *being seen generously*), status, recognition. |
| **Hands** | The actors. Many Hands — reciprocity, contribution, silliness. Always feminine, graceful, natural. | Participation: shifts, contributions, shoutouts, the directory, anything a member *does* for the whole. |

The hierarchy: **the triangle holds, the eye witnesses, the hands act.** When a new surface
needs a symbolic anchor, ask which of the three it serves. (The Salon emblem — eye with rays —
and the badge — hand — already obey this instinctively.)

## 3. Mark-making principles

1. **Engraved, never printed.** Hairlines that taper and breathe; nothing flat, chunky, or
   "app icon." If it could ship in a modern UI kit, it's wrong.
2. **Gold is the ink, not the paint.** One luminous material on deep ink. Richness comes from
   linework and negative space — never gloss, gradients, or rendered shine.
3. **The feminine hand is sacred.** Natural, lifelike proportions of a graceful woman's hand —
   slender but human, steady, porcelain-smooth. Never anatomical, never exaggerated. (The
   full hard-won spec lives in the icon-lab history; do not stack intensifiers.)
4. **Celestial punctuation, spent sparingly.** Four-pointed stars, bead dots, rays, and moon
   phases are the grammar of emphasis. Every mark earns at most one moment of sparkle.
5. **Radiance means presence.** Rays emanate from what matters (the resonance board is
   unanimous: eyes, suns, held things all radiate). Use radiance to say "this is alive/holy,"
   never as filler.
6. **Symmetry on a vertical axis; life inside it.** Compositions hang on a calm vertical
   spine (celestial charts, the symmetry piece, the logo). Organic subjects — hands, eyes,
   flowers — sit *within* geometric order, not instead of it. The triangle frames; it never
   cages.
7. **Steady strength beneath the grace.** Composed, unwavering lines. Elegance is not
   waviness.
8. **Two-tone is permitted vocabulary.** The board embraces solid silhouette + fine gold line
   *together* (the tarot hands, the evil-eye card). Silhouette for weight and small sizes;
   engraving for ceremony. Same trinity, two registers — mirroring §1.

**We are:** engraved, moonlit, gilded, witnessed, reciprocal, symmetric, silly-sacred, calm.
**We are never:** glossy, chunky, neon, anatomical, cluttered, solemn, corporate, loud.

## 4. What the resonance board says (reading of the 11 pieces)

Unforced agreement across everything Chanterelle collected: gold on dark (or its inversion,
ink on cream); eyes at the center of radiance, often with a crescent-moon pupil; hands as the
only human presence, always graceful, often paired and reciprocal (offering/receiving);
moon phases as connective punctuation; fine filigree at edges, breathing space at center;
geometry (diamond/triangle/circle) as the container for organic subjects. The single most
Glåüm image is the letterpress eye with the crescent pupil and uneven ray crown — quiet,
witnessing, gilded, slightly playful. Calibrate against it.

## 5. Weaving philosophy into the app as it grows

Standing guidance for development (not a retrofit project — apply as surfaces get touched):

- **Symbolic anchoring.** New features take an anchor from the trinity (§2 table). Examples:
  attunement/status surfaces are eye-territory (witnessing language: "seen," "recognized");
  participation flows are hands-territory (reciprocity language: "offer," "many hands");
  configuration is triangle-territory (holding language: "structure," "frame").
- **Ornament is centralized and swappable.** Sacred symbols enter the UI through shared
  ornament components/assets, never scattered inline — so the Glåüm trinity remains the
  *flagship theme's* vocabulary, and a future community can carry a different trinity without
  structural change. (Generalizability: philosophy lives in the theme layer; the frame is
  agnostic. Logged in `docs/generalizability-log.md`.)
- **Copy carries philosophy too.** The house voice on the night face: ceremonial warmth with
  a straight face ("Cabinet of Distinctions," "Attunement"), never corporate. One wink per
  page is enough.
- **Calm is a feature.** Whitespace, one focal point per surface, radiance only where meaning
  lives. When a screen feels crowded, remove ornament before removing content.
- **Config restraint still rules.** Philosophy never becomes admin toggles.

## 6. Practical palette & craft notes

Ink `#1A0A24` · antique gold `#C8A848` · cream `#F3EDE6` · purple accent `#D239F8` (night
face); the violet kitsch spectrum belongs to the daylight face and marketing surfaces.
Vector marks are single-colour `currentColor` SVGs (retintable per community); the
image-gen → potrace pipeline and its prompt language live in `design/icon-lab/` on the
`design-exploration` branch.

## 7. Naming-session verdicts (2026-07-02, seven forced pairs)

1. **No palm star.** The hand's palm stays bare; radiance (the ray halo) carries the
   sacredness. Confirmed twice independently (pairs 1 and 2).
2. **The silhouette is the hand's mark register;** the line-engraved hand is the large
   ceremonial register. Both remain canon (principle 8), silhouette leads at icon scale.
3. **Hand spec, final form:** the natural full-palmed shape (never elongated or sleek-narrow)
   drawn with clean minimal linework and whisper-light shading only.
4. **Icons execute as gilded solid medallions** — gold disc, emblem engraved through to ink,
   thin struck rim. (Third consecutive confirmation of the medallion direction.)
   *Superseded-in-part 2026-07-02 evening: engraved medallions failed the distance test —
   "hard to read from far away, and that's mainly what these would be used for." UI icons
   execute in the SILHOUETTE register instead (verdict 8); the engraved medallion remains the
   ceremony register for large, contemplative surfaces.*
5. **Page chrome stays in the calm middle** — neither austere-minimal nor framed-ornate.
   Icons change; the app's current chrome density is approximately right.
6. **Distinctions are plain gold coins.** No ribbons, pins, or regalia — honours, not medals
   of rank.
7. **Hard rule — never cartoon.** Chunky, rounded, "mickey-mousey" hand geometry is banned;
   hand marks come only from the natural-hand generation pipeline, never hand-drawn vector
   approximation.

8. **The icon register — superseded same night by verdict 9.** (Interim silhouette-on-disc
   exploration; its three laws — chiselled taper, sparse cutouts, palm-base crop — survive
   and carry into verdict 9.)

9. **THE REGAL REGISTER (2026-07-02 night — final).** After flat, engraved, silhouette, and
   gilded-vector experiments: *"only the reference has a truly gold, regal feel."* The
   reference is her own `raised-hand.webp` — icons are **smooth sculpted regal gold**:
   dimensional emboss, gentle rim light, clean elegant polish. Never busy loot texture,
   never flat graphic, never glossy plastic, and never de-goldified — gold here is a
   *material*, carried by tonal range, not a hex fill. Laws within the register:
   - **The raised hand is the standard.** New subjects are struck by anchoring generation
     to the hand file itself (style) plus the subject's existing artwork (geometry) via the
     image-edit endpoint — taste is anchored to loved artifacts, never re-described.
   - **Cutouts carry depth; a little goes a long way.** Negative space (the lantern's open
     glass, one tapered flame cut) does more than added ornament; detail lines taper like
     chisel strokes.
   - **The hand crops at the palm base.** No wrist, no forearm at icon scale.
   - Delivered as transparent-background assets in `public/asset-library/icons/`.
   - The whole method is a tool: `scripts/strike-icon.py` (subject + optional geometry
     anchor → regal strike → keyed transparent, cropped, webp). Exploration history and
     galleries are archived under `design/icon-lab/regal/` on the design-exploration branch.

10. **THE BADGE REGISTER (2026-07-03).** Badges (distinction medals) are a separate
    category from icons, doing different things. An icon is a solid sculpted subject,
    no disc, read at a glance from across the room. A badge is a *place*: warm
    dimensional embossed gold on a deep aubergine disc face, composition-rich (wreath,
    star, a scene held between hands), rewarding the close look a medal invites. The
    standard is the Glåüm Elder medal (`asset-library/distinctions/elder-tree.webp`) —
    re-strike experiments that simplified for small sizes lost either the warmth
    (flattened into graphic) or the disc (all-metal coin); *"the original is still the
    winner."* Its warmth outranks small-size crispness at badge scale. Anchor badge
    work to it the way icon work anchors to the hand.

## 8. Status

- **v1.0 — validated 2026-07-02.** Falsification test passed 8/8: blind sort matched sealed
  predictions on all four obedient specimens (medallion, ceremonial line, silhouette — both
  subjects) and all four violations (cartoon, wavy, glossy, clutter). The icon library batch
  executes against this document.
- Still open (minor): how the triangle appears in UI beyond the logo (frames? section
  markers? loading states?); the silly↔sacred setpoint for marks (naming-session pair 7
  failed on execution before spirit could be judged — retest with pipeline-quality pieces).
- **2026-07-03 cohesion pass (full app walk):** the language is holding across member and
  admin surfaces without retrofit effort — one colour source, one icon renderer, trinity
  language in the admin chrome, one wink per page. The load-bearing devices and the seams
  (two unstruck department seals; hands ornament not yet centralized) are recorded in
  `docs/ux-review-log.md` (sixth pass) — that entry is the "keep doing this" list.
