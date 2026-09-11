# Radio — the curated community feed

Radio is the community's heartbeat surface: a **curated stream of meaningful
moments** that helps members feel connected to the rhythm of camp. It is
deliberately **not** chat (no threads, no replies — Messages exists for that)
and deliberately **not an audit log** (it records moments, not database
changes).

> Radio answers "What's happening around camp?" — never "What changed in the
> database?" Every post should make a member think "Oh!"

In the design-philosophy trinity, Radio is **the eye witnessing** — the
community seeing itself act, in the present tense (the Cabinet of Distinctions
witnesses the past tense).

## The editorial bar

Every candidate event asks: **"Would the average member care?"**

✅ On the air: contributions committed, distinctions earned, organizer
announcements, events starting, community milestones, welcomes, member voices.

❌ Recorded internally only (never Radio): profile edits, bio updates,
settings changes, group description changes — anything that reads like a
changelog.

The writing is editorial, not mechanical — headline + optional supporting
line, present-tense, momentum-building ("Only one more is still needed!").
Content leads; **timestamps whisper** (tiny, low-opacity, right edge). All
copy lives in one place: the post builders in `lib/radio.ts`. Headlines
light the moment's **entity** gold via a `**…**` convention rendered by
`components/RadioMessage.tsx` ("Sarah is bringing a **camping stove**.") —
organizer broadcasts can use it too.

## Visual language (from Chanté's 2026-07-03 mockup)

No card boxes and **no avatars** — an airy hairline-separated list where a
large raw emoji (or medal art) is each moment's emblem and gold highlights
carry the story. The lit entity **is the hyperlink** where a destination
makes sense (welcome names → the member's profile via
`/members/{clerk_id}`; contribution items and milestones → the Bring
Something board) — no invisible whole-row links; a linkless post is just a
post. **Human speech reads differently from automatic moments, but every
speaker reads the same**: organizer broadcasts and member voices share one
style — **right-aligned**, purple, italic, emoji inline (no emblem column),
the clock on the left edge, and always **signed with the speaker's name**
("— Sarah") — a voice calling in from the other side of the airwaves, whoever
holds the mic (Chanté 2026-07-08: "anyone messaging to radio should look the
same"; the earlier broadcast-flush-left / voice-right split was retired — now
both read as the right-aligned voice). **@mentions** of members render as
gold/purple profile-linked pills, and the inline emoji is a **📢 megaphone**
when the post rang the whole camp (notify-all), ✦ otherwise. Hero header (`RadioHero.tsx`, from her banner mockup: the ((✦))
waves mark beside the title, an ornamental diamond rule, a warm-gold script
subtitle in Caveat — loaded via `next/font` for this page only — and the
frequency-waveform graphic with glowing motes, all inline SVG), a **stats band**
(on the air this week / resources claimed / distinctions awarded /
announcements shared — `getRadioStats`), the day rules end in a ✦, and the
feed signs off with *"That's all for now. Stay tuned."*

## Post kinds

Each kind has its own card language on `/radio`, so the feed has rhythm:

| kind | Written by | Default | Card | Example |
|---|---|---|---|---|
| `broadcast` | organizer composer (`POST /api/admin/radio`) | always on | speech: right-aligned purple, emoji inline, signed "— Name" (the route stamps the poster's name into `actor_name`) | 📢 Tea service has moved to the Salon. · *— Chanté* |
| `welcome` | application approve route (dup-guarded) | **on** | purple-tinted, avatar | 👋 Welcome Michael to Glåüm! · *Say hello if you see them around camp.* |
| `contribution` | first resource claim + bring-it offers (quantity edits/unclaims silent — retreats are never broadcast) | **on** | ✨, gold detail line | ✨ Sarah just covered a camping stove. · *Only one more to go!* |
| `achievement` | manual distinction grant (rule-derived earns have no stored moment — daily diff via the cron pattern is a future round) | **on** | medal art, ringed disc, engraved italic detail | 🏅 Erik earned the Setup distinction. |
| `milestone` | claim that completes a resource list (guarded — one per list completion) | **on** | centered celebration, no disc | 🎉 Shared Kitchen is now fully equipped. |
| `voice` | any approved member (`POST /api/radio`) — see "Writing is open" below | **on** (admin kill-switch) | speech: same style as `broadcast` — right-aligned purple, ✦ (or 📢 if notify-all) inline, signed "— Name" | ✦ The sunset from the tower is unreal right now. · *— Sarah* |

Automatic sources are toggleable in `page_content.config_radio`
(`{ sources: { welcome, contribution, achievement, milestone, voice } }`,
parsed by `parseRadioSources` — absent key = all on). Organizer broadcasts
have no toggle; posting one is already the decision.

## Writing is open (Chanté 2026-07-08 — reversed the 2026-07-03 gate)

Radio is an open airwave: the `/radio` composer ("Share with camp…", ON AIR
button, GO LIVE bar at the feed's end) is available to **any approved member**
(the page already gates on approved membership). Posts go out as `voice` via
`POST /api/radio`, right-aligned and signed. Admins keep a separate "official"
path — the Admin → Radio console posts `broadcast` via `/api/admin/radio` —
but both render identically. The **Member voices** toggle in `config_radio`
is the admin kill-switch for open-mic (turning it off makes `/api/radio`
reject with a real error).

Two things ride on a post:

- **@mention** — the composer autocompletes member names on `@`; a mention
  rings that member's bell + email (their message preference), and the feed
  renders it as a profile-linked pill. Server-side matching is the same
  name-based whole-token match the group threads use.
- **@here** — the notify-everyone token (Slack-style; Chanté 2026-07-08,
  replacing an earlier "Notify everyone" checkbox). It sits atop the @
  autocomplete, and the server matches `@here` as a whole token (so a typed one
  counts too). Posting an `@here` line arms a **confirm step** ("📢 @here alerts
  every member by bell and email. Send anyway?") so nobody rings the whole camp
  by reflex. The post is marked with a **📢 megaphone** and alerts every
  approved member (their announcement preference); `@here` renders as a gold
  everyone-pill in the feed. Mentioned members get the personal mention instead
  of the general broadcast — each person is reached once. Radio still never
  notifies for *ordinary* posts (Messages interrupt; Radio informs) — @here is
  the deliberate exception, the same seam the organizer broadcast's "Also alert
  members" uses.

## Surfaces

- **`/radio`** — members-only. Hero + stats band → composer → Now/Up-next
  strip → a kind filter row (All + one chip per kind, understated text with a
  thin gold underline on the active kind, not pill buttons) → the feed
  (day-grouped rows, newest first, latest 60). The filter is client-side over
  the already-fetched 60 (`RadioFeed.tsx`, shipped 2026-07-08) — no new fetch,
  since the feed already loads everything in one shot. Kind labels/emoji come
  from `RADIO_KIND_META` (`lib/radio.ts`), the one place both the filter and
  any future UI should read them from.
- **Now / Up next strip** — derived at read time, never stored: the camp-day
  welcome ("Day 2 of camp") while today is inside
  `config_event_start_date…end_date`, plus what's happening now and the next
  thing starting today from `schedule_events` (visible + on-schedule,
  `general`/`mandatory` — shifts are work slots, not atmosphere). The client
  picks against the member's own clock (their device is at camp; the server
  is in UTC), re-checking each minute.
- **Home dashboard teaser** — the `activity` widget ("On the Air") shows the
  latest 6 posts and links to `/radio` (replaced the old joins/profile-updates
  feed — joins now *are* Radio welcomes).
- **Admin → Community → Communication → Radio** (`RadioManager`, a collapsed
  section on `/admin` beside Announcements — curating the feed is
  communication work, not programming; re-homed out of Program 2026-07-03) —
  compose broadcasts, toggle the automatic sources, and curate: **any** post
  can be removed.

## Data

**`radio_events`** (migration `061`): `kind` (open set, no CHECK), `message`
(the headline, name inline), `detail` (optional supporting line), `icon`
(emoji or asset path), `actor_clerk_id` + `actor_name` (name denormalized at
write time — the feed is a historical record; avatar joined fresh at read,
the shoutouts pattern), `link`, `created_by`, `visible`, `created_at`
(indexed DESC). Writes go through `postRadioEvent` / gated
`postSourcedRadioEvent` — best-effort, never blocking the action they ride
on. The migration **backfills** one welcome per approved application from
`reviewed_at`, so the feed is born alive.

## Notifications

Radio does not notify for *ordinary* posts — Messages interrupt, Radio informs.
Three deliberate exceptions, all opt-in at compose time:

- the organizer composer's **"Also alert members"** checkbox (bell + announcement
  email honouring `notification_preferences.email_announcements` — the lead-up
  notify pattern). Default off.
- **`@mention`** — rings the mentioned member's bell + a message-email.
- **`@here`** — notify-all (bell + announcement email to every member, the post
  marked 📢), guarded by a confirm step in the composer.

The last two arrived with open mic (2026-07-08) — see "Writing is open" above for
the full semantics. All three dispatch through `lib/notify.ts`; a mentioned member
gets the personal mention rather than also the broadcast.

## Future rounds (explicitly deferred)

- Rule-derived distinction earns (daily diff job on the cron)
- "Still needed" nudges ("🪑 Decor still needs two rugs") and event-start
  posts as stored moments (the strip covers "now" live)
- Optional push for flagged broadcasts (post-PWA-notifications decision)

## Radio voices vs Shoutouts (decided 2026-07-03: they stay separate)

Same input mechanics, opposite delivery contracts. **Shoutouts are pinned to
the reader** — they hold a slot on the dashboard widget and keep earning
impressions ("S.O.S. Has anyone seen my furry vest?" needs eyes until it's
found). **Radio voices are pinned to the moment** — witnessed by whoever is
tuned in, then they sink; the expectation is a voice will likely not be seen
beyond the moment, and that's the point. Post to Shoutouts when you need a
response; put a moment on Radio when it deserves witnessing. Neither absorbs
the other.
