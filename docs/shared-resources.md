# Shared Resources

Communities coordinate physical objects members bring to an event — stoves,
coolers, tools, shade structures, decor. Today that happens in spreadsheets and
"who's bringing a camping stove?" threads. Shared Resources makes it a
first-class concept: the community keeps **lists** of what's needed, any member
meets a need with one-click **claims**, and the totals take care of themselves.

**Member-owned since 2026-07-08.** It began (2026-07-02) as an admin-curated
tool — admins authored needs, members only claimed. Two moves opened it up:
first a member "contribute" flow, then (this change) the admin console surface
was **removed entirely** and list/item authoring moved to `/participate`, where
**any approved member creates lists and adds items**. Editing is wiki-open; the
one guardrail is that **deleting a whole list is admin-only**.

Built 2026-07-02 · migrations `051_shared_resources.sql` + `052_resource_list_stewards.sql` + `053_resource_offers.sql` + `055_resource_item_icons.sql` + `070_resource_list_dashboard.sql`. The member-ownership move itself needed no migration (wiki editing needs no owner column; list-delete reuses `requireAdmin`); the dashboard opt-in added `070` (`show_on_dashboard`).

## The model

Three tables (see `docs/database.md`):

- **`resource_lists`** — a named collection ("Shared Kitchen", "Setup
  Equipment"), created by any approved member. **No owner column** — editing is
  wiki-open, so there's no per-user gate to record. `show_on_dashboard`
  (migration `070`, default **false**) is a per-list opt-in to the home
  dashboard widget, toggled in the list editor — distinct from `visible`. The
  legacy **steward** FKs (group / department / role, at-most-one CHECK,
  migration `052`) survive on admin-made lists as display-only context but are
  no longer settable. `visible` survives too but is no longer toggleable —
  member lists go live on create (legacy `visible = false` lists stay hidden).
- **`resources`** — one item per row: name, optional note, `quantity_needed`.
  A **NULL target = open offer** (migration `053`) — gear added without a "how
  many needed". Any approved member sets or edits a target (blank ↔ number)
  turning it into or out of a tracked need; claims stay attached. `offered_by`
  records who added it (NULL = legacy admin-authored). No approval queue — an
  item is a listing.
- **`resource_claims`** — one row per member per resource (`UNIQUE`), carrying
  a `quantity`. Bringing three coolers = one row with quantity 3.

**Totals are always derived from claim rows, never stored** — the same rule as
distinctions. **A claim is the confirmation**: there is no pledge→confirm
workflow. Over-fulfillment is allowed and shown (5 of 4 is information the
organizer wants, not an error).

## Permissions (member-owned, wiki-open)

Enforced server-side and mirrored in the UI (`canManage` = approved +
non-suspended; `canDeleteLists` = admin, both set from the `/participate` page):

| Action | Who |
|---|---|
| Create list | any approved, non-suspended member |
| Rename / edit list | any approved member (wiki) |
| **Delete list** | **admin only** (`requireAdmin`) — cascades items + claims |
| Add item (optional target) | any approved, non-suspended member |
| Edit item (name / note / target) | any approved member (wiki) |
| Delete item | any approved member (wiki) — client confirm surfaces the claim count |
| Claim / unclaim | any approved member |

Suspended members keep read + unclaim but can't create/edit/add. There is no
admin console for resources — admins manage on `/participate` like everyone,
with the added ability to delete a list.

## Surfaces

- **Member: `/participate` → "Bring Something"** (`ResourceCommitments.tsx`,
  anchored `#bring`, **above** Your Groups — needs are live and time-sensitive,
  group membership is set-once): a **preparation board**, not an inventory —
  it answers *"what can I do that would be most helpful?"* first (redesigned
  2026-07-02 on Chanté's direction). **Each list is ONE collapsible card**
  (gold border, header / items / footer, 2026-07-03) — **collapsed by default**
  (2026-07-08): the board reads as a scannable index of *every* list (a header
  row with title + health pill + a one-line summary like "3 still needed · 14
  items"), so empty lists are as visible as full ones. Tap a header to open it
  (items + add footer + Edit/Delete); creating a list or adding an item
  auto-opens that list. **Open call** (2026-07-08, derived — no flag, no
  migration): a list with **no tracked needs** (no targeted items, e.g. Decor —
  the organizer doesn't enumerate; members bring what fits) presents as an
  **invitation, not an empty inventory** — collapsed summary *"Open call — tap
  to contribute"* (empty) / *"Open call · N items"*, and the opened card leads
  with *"✦ An open call — bring whatever you think would help."* under the
  description. Adding a targeted item flips it back to a tracked list
  automatically. Below:
  - **Toolbar** (top, 2026-07-08) — **＋ New list** (title + description inline
    → live immediately) and **＋ Contribute something** (add an item to any list
    via a list picker, without hunting for the right card). Two-up on desktop,
    stacked ≤520px.
  - **I'M BRINGING** — a pinned card of my commitments ("✓ Camping Stove ×2 —
    Shared Kitchen") with per-row *Edit ›* that expands + scrolls to the item.
  - **Automatic list health** (2026-07-03, replacing the % bar — one
    generator isn't one fork, so counts are harder to misinterpret than a
    unit-weighted percentage): a pill by the title — **Needs Attention**
    (purple) → **Almost Ready** (gold; ≤2 items short or ≥80% of items
    covered) → **Complete** (green) — plus *"18 of 22 resources covered ·
    4 still need attention"* (item counts). Almost-ready celebrates *"✨ …
    is almost ready — only 3 more items needed."*; complete keeps *"✨ …
    is fully equipped! Thanks to everyone contributing."*
  - **The pulse** (2026-07-03) — one quiet italic line atop the board,
    derived from `resource_claims.updated_at` (never stored): *"✦ 3 members
    contributed resources today — thank you."* (≥3 in 24h), else *"✨ Sarah
    just covered the last Cooler!"* / *"✦ Sarah just committed to bringing
    Cooler."* (latest claim within 48h). People preparing together, not
    inventory being managed.
  - **Dense task-list rows** (2026-07-03, GitHub-Issues density — lists may
    grow to dozens of items): hairline-divided rows inside one bordered
    container per status group — **Still Needed** (shortage leads:
    **"Still need: 3"** bold; "I'll bring one" right on the row) →
    **Covered** (dimmer; "Bring an extra" inside the detail) → **Member
    Contributions** (member-added items with no target). Each row: small
    icon, name, one meta line (shortage/covered/*"Added by …"* + first two
    claimant names inline: *"· ✓ Erik, Sarah +1"*). A row I've claimed tints
    purple.
  - **Expandable rows** — compact by default; expanding shows the note,
    **who's bringing it** (✓ names, quantities, "You" first — social proof,
    member-visible), my −/+/Remove claim controls, and (for approved members)
    an **Edit item / Remove item** row below a hairline. Editing swaps in inline
    name / note / "how many needed?" inputs; removing confirms and warns when
    others are bringing it. Unclaiming is always allowed. Hierarchy: dashboard =
    *tell me where I'm needed* → page = *help me take action* → expanded row =
    *give me all the details*.
  - **List header controls** (2026-07-08) — an **Edit** link (inline rename +
    description, wiki-open) and, for admins only, a **Delete** link (confirm
    counts the items + commitments it removes).
  - **The add-item form** (shared by the toolbar's Contribute and each card's
    footer) — name, optional details, an optional **"How many needed?"** number
    (blank = an open offer; a number = a tracked need with shortage counts), and
    an **"I'm bringing this myself"** checkbox (default on → seeds the ×1 claim +
    fires the radio moment; off = a heads-up for others). The per-list footer
    reads *"＋ Add something to this list"* (list pre-fixed); the top-level entry
    carries the list picker. Retracting your own contribution's last claim
    removes the listing.
- **Home dashboard: the Bring Something widget** — a configurable dashboard
  widget (id `resources`, reorder/hide/resize via the page editor like any
  other). It answers *"what does the community still need from me?"*, not
  "here is a link to the Resources page":
  - **A compact index of opted-in lists** (2026-07-08, reversing the earlier
    "one list, not a directory"): **one row per list** flagged
    `show_on_dashboard` — the list title + a right-aligned status (*"3 still
    needed"* gold / *"✓ all covered"* green / *"N being brought"* dim /
    *"✦ open call"* gold for a list with no tracked needs and nothing brought
    yet). An **open-call list** (no targets) also renders its **description as
    an italic callout line** under the title — the invitation in the list's own
    words ("Bring anything that sparkles"), written once in the list editor's
    description field (no separate callout field). Capped at 6 rows with "+N
    more lists". Members opt a list in via the **"Show this list on the home
    dashboard"** checkbox in the list create/edit form (default off) — so the
    widget shows exactly the lists the community chose to surface, empty or not.
  - **Collective progress** — an overall "% Ready" in the header (unit-weighted
    across all flagged lists; never rounds up to 100 while short); shown only
    when some flagged list has a target.
  - **Personal line** — with claims: "You're bringing Camping Stove ×2,
    Cooler — thank you ✦" (gold); without: "You haven't committed anything
    yet — see what's needed →"; all covered: "Everything's covered…".
  - **Hidden entirely until a list is flagged** (`show_on_dashboard`) — with
    the opt-in default off, the widget renders nothing until a member turns a
    list on. The **whole card** links to `/participate#bring`; data via
    `getResourceWidgetState` (`lib/resources.ts`; untargeted contributions
    never gate readiness; over-fulfillment never inflates it). The participate
    page's sections arrive server-rendered (initial data via
    `lib/participate-data.ts` / `getMemberResourceView`), but late layout shifts
    (images, fonts) can still nudge the anchor, so `ResourceCommitments` **pins**
    `#bring` on every layout change for the first ~3s (ResizeObserver on body;
    the first wheel/touch cancels).
- **Profile → Active Commitments**: each claim renders as a `BRINGING` row
  ("Camping Stove ×2 · Shared Kitchen", with the item's icon when set) via
  `lib/resources.ts` → `getMemberResourceClaims`, and counts toward the
  Active Commitments stat. Hands act, witnessed.

## API

All member-facing; there are **no `/api/admin/resources` routes** (removed
2026-07-08). Gate: `getApprovedMember` + `suspended_at`, except list DELETE
(`requireAdmin`).

- `GET /api/resources` — member view: visible lists + items + totals + own claim
  + `offered_by` attribution + **claimant names** (`claimants: [{ name,
  quantity, me }]`, "You" first — the board's social proof) + the pulse.
- `POST /api/resources/lists` — `{ title, description }`; create a list (live).
- `PATCH /api/resources/lists/[id]` — `{ title, description }`; edit (wiki).
  `DELETE` — remove the list (items + claims cascade). **Admin only.**
- `POST /api/resources/items` — `{ list_id, name, note, quantity_needed?, bring? }`;
  add an item. Blank/absent `quantity_needed` → open offer (NULL), else a
  tracked need (1–99). `offered_by` = caller; `bring` (default true) seeds the
  ×1 claim + the `contribution` radio moment (+ a `milestone` post if the claim
  completes the list). **Absorbed the former `/api/resources/offers`.**
- `PATCH /api/resources/items/[id]` — `{ name, note, quantity_needed }`; edit
  (wiki). `DELETE` — remove the item (claims cascade). (wiki)
- `POST /api/resources/claims` — `{ resource_id, quantity }`; quantity 0 removes
  the claim, otherwise upserts. Quantity clamped to 1–99. Removing the last
  claim on your own contribution deletes its row (retraction).

## Non-goals (deliberate, revisit post–What If)

- **No per-user ownership.** Editing is wiki-open, so a list records **no
  creator/owner** and permissions are role-based, not row-based (any approved
  member edits; only admins delete a list). The legacy *steward* FKs (group /
  department / role, migration `052`) survive as display-only labels on
  admin-made lists but are no longer settable. If real per-owner behaviour ever
  proves necessary, add a `created_by` column + the exclusive-arc FKs migrate
  cleanly.
- **No event scoping.** Lists implicitly belong to *the* event — a
  single-community assumption, logged in `docs/generalizability-log.md`.
  Multi-event/multi-tenant scoping is a foundation-phase concern.
- **No standalone offer workflow.** An "offer" is just an item with a NULL
  target (migration `053`) inside a list — no approval queue, no offer inbox, no
  separate entity. A contribution always attaches to a list (`list_id` is never
  NULL). Since members can now **create lists** freely, the old "an offer that
  fits no list" gap is gone — you make the list. No catch-all list, no schema.
- **No pledge→confirm ceremony**, no reminders/nudges, no per-item reordering
  UI (creation order is the display order).
