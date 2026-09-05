# Mobile — One Product, Two Clients

Direction set 2026-07-03, **revised same day** after the home-screen concept round (see History below). **Launch target: before What If (July 23, 2026)** — decided later the same day; the app ships as a real installable app (TestFlight/store distribution), not as an installed PWA (see Explicitly rejected).

> **Sibling doc:** [`multi-community.md`](./multi-community.md). The two long-term tracks demand the *same* foundation — a real API boundary, server-side business logic, config over hardcoding. The post–What If foundation phase serves both; there is no separate "mobile workstream."

---

## Philosophy

**One backend. One information architecture. Two clients.**

The mobile app is **the same product, optimized for a different device** — not a separate mobile ecosystem with its own mental model. Users learn the platform once; the navigation and concepts they know on the web don't change because the screen got smaller.

- **Web** — optimized for larger screens; remains the organizer's primary workspace.
- **Mobile** — optimized for quick interactions: the same questions (*What's happening? Where do I need to be? Did anyone message me? How can I help?*), answered faster.

The difference is in the **interaction patterns, not the product structure.**

### Shared information architecture

Both clients navigate the same surfaces:

- Schedule
- Radio
- Many Hands — the member registry (today's `/members`): *see the many hands you're building with*
- Messages
- Participate
- Profile

("Many Hands" is Glåüm terminology — hands-pillar naming for the directory. When the nav rename actually lands in the app, log the term in `generalizability-log.md` like the other community-specific vocabulary.)

### Explicitly rejected (2026-07-03)

- **A separate mobile philosophy.** No mobile-only paradigm centered on a single concept — a Radio-led home, a daily briefing, a glance dashboard. Those were explored (concept round 1) and set aside: they'd require members to learn a second mental model, which is unnecessary complexity.
- **Admin on mobile.** Department/role/distinction/profile-field configuration, event and resource management, application review — all stay web. Unchanged from v1 of this direction.
- **The PWA-install route — tried with real members, rejected (2026-07-03).** Getting people through iOS Share → Add to Home Screen is too much friction; members don't complete it. Do not re-propose installed-PWA launches, install-nag cards, or the iOS 16.4 Web-Push-on-installed-PWA "bridge" — anything that depends on members having installed the PWA is built on a dead dependency. (The PWA shell remains as a harmless bonus; webview *technology* like Capacitor is a separate question and is not rejected — the rejection is the install/distribution path.)

---

## One shared app, many communities (direction logged 2026-09-04, work not started)

From the delivery-model direction in [`business.md`](./business.md) (discussion log 2026-09-04)
/ [`multi-community.md`](./multi-community.md) → Delivery model — the multi-tenant future of this
same app:

- **One published Many Hands app for all communities — not a branded app per community.** A user
  logs in and sees the communities they belong to (Glåüm *and* a retreat *and* a festival *and*
  a local collective), each rendered according to that community's configuration. Publishing the
  app once must NOT force communities to look or behave identically — the app is **driven by
  platform configuration** (branding, terminology, navigation, enabled features per tenant).
- **Push notifications are community-specific** and deep-link into the relevant content — the
  existing webview-bar rule "anything worth notifying about has a URL" extends naturally to
  "…namespaced by community."
- **The rendering constraint (this is the load-bearing point):** the native app can only render
  capabilities the platform generalizes. Tenant *configuration* can vary the app dramatically;
  truly arbitrary custom client code cannot appear in it. Escape hatches for rare one-offs —
  web-only features, a generic embedded/webview page, custom content blocks — exist but must not
  substitute for generalized platform design. Consequence: every future platform extension
  should be designed as a config-renderable primitive (see the extension protocol in
  `multi-community.md`), which is a strong argument for keeping the app a thin client over the
  shared backend rather than accreting client-side feature logic.
- One firsthand motivation Chante named: Glåüm showed people want extremely fast phone access,
  and push could make a huge difference in engagement — preserving the generalized architecture
  is largely *for* this app.
- **Naming note:** "Many Hands" as the platform's working name collides with this doc's use of
  Many Hands as Glåüm's member-registry nav surface — resolve deliberately if the platform name
  sticks (business.md open question #4).

---

## Mobile-specific improvements

Make the existing experience feel native rather than redesigning it. The current web app is already evolving mobile-friendly bones — mostly single-column layouts, large touch targets, clear hierarchy — so responsive design plus native capabilities do most of the work:

- Bottom navigation
- Native push notifications
- Pull-to-refresh
- Swipe gestures where appropriate
- Better touch spacing
- Native image picker / camera
- QR scanning
- Offline schedule caching
- Haptics
- Faster page transitions and animations

Several of these (bottom navigation on small screens, touch spacing, transition polish) are ordinary responsive work that can land in the **web product** whenever a surface gets touched — no app required.

> **Landed:** bottom navigation shipped on mobile web 2026-07-03 (`components/MobileTabBar.tsx`) — the member nav list rendered as icon tabs; same surfaces, same order as the desktop top nav.

---

## Push notifications — the biggest motivation

Examples of what mobile should deliver:

- Someone replied to a message.
- Your shift starts in 30 minutes.
- Dinner has moved.
- Opening Ceremony begins soon.
- Your resource commitment has changed.
- Important organizer announcement.

Two notes:

1. Several of these are **scheduled** notifications ("starts in 30 minutes"). The Vercel Cron pattern established by attunement nudges (`/api/cron/attunement-nudges`) already prototypes the delivery mechanism for time-triggered sends.
2. Push delivers via **native push (APNs/FCM) through the installed app** — the Web-Push-on-installed-PWA bridge is off the table (see Explicitly rejected). The dispatch seam is channel-agnostic either way: email today, native push when the app ships; members without the app stay on email.

---

## Architecture

Both clients consume the same backend APIs. The backend remains the source of truth; business logic lives on the server whenever possible. The mobile client is **just another client** over the same data model.

```
        Backend APIs (Next.js API routes + lib/)
              /                      \
     Web client                 Mobile client
  (larger screens,          (quick interactions,
   organizer workspace)      native capabilities)
```

### Where the codebase already stands (assessed 2026-07-03)

- **Member *write* API surface is essentially mobile-ready.** Messages (send/read/unread, DM + group), event RSVPs, lead-up RSVPs, shift signups, resource claims + list/item authoring, poll votes, group join/leave, shoutouts, radio posts, profile fields/avatar — all already exist as API routes.
- **The gap is member *read* endpoints.** Schedule, dashboard, commitments, and attunement data are fetched inside server components (a deliberate perf choice — see `docs/architecture.md` → Auth standing rules). The logic lives in `lib/` (`participate-data.ts`, `attunement.ts`, `resources.ts`, `conversations.ts`, `groups.ts`, …), so closing the gap later is mechanical: wrap the same functions in `GET` routes. **Do not build this API layer preemptively.**
- **Business logic is already server-side** (`lib/member-facts.ts`, `lib/distinctions.ts`, etc.).
- **Auth is a non-issue.** Clerk ships native SDKs; existing routes' `auth()` checks accept native session tokens. Same instance, same users.

### App compatibility (standing — check on EVERY member-facing change)

The member site runs inside the native app shell, so the web *is* the app. Whenever a member-facing surface is built or touched, hold it to the webview bar:

1. **Complete in-app navigation.** Never rely on browser chrome — no "the user can hit the browser back button," no URL-bar assumptions. Every surface must be reachable and escapable through on-page UI (the tab bar covers the top level; nested pages need their own way back).
2. **No popup/new-window flows.** Auth and any future OAuth stay redirect or in-page (no `window.open` flows — they strand members in a webview). External links are explicit `<a target="_blank" rel="noopener">` so the shell can hand them to the system browser.
3. **Deep-linkable.** Anything worth notifying about has a URL — push taps open internal paths (`lib/push.ts` sends `link`), so a notification without a destination page is a bug.
4. **Safe areas on fixed chrome.** Any `position: fixed` element respects `env(safe-area-inset-*)` (the tab bar does; a fixed top header needs the top inset once the shell exists).
5. **Touch-first.** No hover-only affordances on member pages; the existing ~380px pass on all UI work is the app's viewport.
6. **Notifications through the seam.** New notification-worthy events go through `lib/notify.ts` — never a direct `send-email` call in feature code.
7. **Fresh content on update.** Members never manually refresh to pick up a deploy. Ordinary changes are already single-refresh (the PWA worker `public/sw.js` caches only `/_next/static/` content-hashed build output — HTML/API/auth and all `public/` assets always hit the network, with `public/` cache lifetimes set by `next.config.js` `headers()`). The one former exception — a changed `sw.js` needing a "reload twice" — is closed: `app/ServiceWorkerRegister.tsx` auto-reloads the page **once** when a new worker takes control (`controllerchange`), guarded so it fires at most once and only for members who already had a worker (not on a first-ever visit). Bumping the `sw.js` cache version (`glaum-static-v4`) still purges old caches on activate; the auto-reload just makes that seamless.

Admin surfaces are exempt (admin is web/desktop, never in the app).

### Standing disciplines (hold from now on — they cost nothing)

1. **New member-facing logic goes in a `lib/` function returning plain JSON-serializable data**; the server component or API route is a thin caller.
2. **Notifications flow through one dispatch seam** — "member + event → deliver via their channels." **Built 2026-07-03:** `lib/notify.ts` (`dispatchMemberNotification`) + `lib/push.ts` (FCM HTTP v1, silent no-op until `FIREBASE_SERVICE_ACCOUNT` is set) + `push_tokens` (migration 062) + `POST /api/push/register`. First consumers: DM and group-message notifications (push per message/mention, email keeps its existing throttles). Don't scatter direct `send-email` calls in new feature code.
3. **Keep the web product's mobile manners.** Since mobile *is* the same product, every responsive improvement to the web (single-column layouts, touch targets, the existing ~380px pass on all UI work) is direct progress toward the mobile client — not throwaway.
4. **No preemptive refactoring** and no speculative API layer. Don't abstract without a second client.

---

## Deliberately undecided

These get better with What If data — do not settle them now:

- **Client technology.** "One product, two clients" reopens the wrapped-web route: a thin native shell (e.g. Capacitor) around the existing responsive UI would deliver push, camera/QR, haptics, and offline caching without rebuilding screens — versus a native-UI client (e.g. Expo/React Native) for maximum interaction quality. Either way, distribution is a real app install (TestFlight/stores) — the pre–What If launch timeline favors the wrapped-web shell.
- Offline strategy beyond schedule caching
- QR check-in and maps

---

## History

- **v1 (2026-07-03, morning):** "companion" framing — mobile as a distinct member experience with its own glanceable home. Explored via **concept round 1**: six home-screen paradigms (`design/app-concepts/` on the `design-exploration` branch — The Frequency, The Day's Path, The Glance, The Evening Briefing, Many Hands, The Lantern).
- **v2 (2026-07-03, same day — current):** after reviewing the concepts, the separate-paradigm approach was rejected as unnecessary complexity. One product, one IA, two clients. The round still yielded keepable interaction details that fit the existing IA and can land in the web product incrementally: **purple = "this changed since you last looked"**, an explicit **caught-up state** ("all else is quiet"), the **on-air Now/Up-next strip** (already part of Radio), and **one-tap offers** wherever a need appears.
