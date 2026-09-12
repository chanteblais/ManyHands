import { Resend } from 'resend'
import type { Community } from '@/lib/community'

const resend = new Resend(process.env.RESEND_API_KEY)

// Every email is sent on behalf of ONE community: its name is the wordmark,
// subject prefix and footer; its first host is the link origin; its
// `email_from` is the sender (falling back to the deployment's RESEND_FROM —
// the domain must be verified in the Resend dashboard — then to Resend's
// sandbox sender). Callers pass the resolved `Community` (lib/community.ts).

/** What an email needs to know about the community it speaks for. */
export type EmailBrand = { name: string; origin: string; from: string }

// Platform default sender: PLATFORM_EMAIL_FROM (the platform's verified
// domain), else the legacy RESEND_FROM, else Resend's sandbox. A community
// with its own verified sender sets communities.email_from.
const PLATFORM_FROM = process.env.PLATFORM_EMAIL_FROM || process.env.RESEND_FROM || 'Many Hands <onboarding@resend.dev>'
const ENV_ORIGIN = (process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/$/, '')

/** Absolute origin for links in this community's emails. */
export function appOrigin(community: Pick<Community, 'hosts'>): string {
  const host = community.hosts.find(h => !h.includes('localhost'))
  if (host) return `https://${host}`
  return ENV_ORIGIN || 'http://localhost:3000'
}

export function emailBrand(community: Pick<Community, 'name' | 'hosts' | 'emailFrom'>): EmailBrand {
  return { name: community.name, origin: appOrigin(community), from: community.emailFrom || PLATFORM_FROM }
}

type BrandSource = Pick<Community, 'name' | 'hosts' | 'emailFrom'>

export type SendResult = { ok: boolean; error?: string }

export async function sendAdminEmail(community: BrandSource, to: string, subject: string, html: string): Promise<SendResult> {
  const brand = emailBrand(community)
  const { error } = await resend.emails.send({ from: brand.from, to, subject, html: wrap(brand, html) })
  if (error) {
    console.error('[sendAdminEmail]', error)
    return { ok: false, error: error.message }
  }
  return { ok: true }
}

export async function sendUserEmail(community: BrandSource, to: string, subject: string, html: string): Promise<SendResult> {
  const brand = emailBrand(community)
  const { error } = await resend.emails.send({ from: brand.from, to, subject, html: wrap(brand, html) })
  if (error) {
    console.error('[sendUserEmail]', error)
    return { ok: false, error: error.message }
  }
  return { ok: true }
}

/**
 * Notify a member that they have received a new message.
 * The link drops them straight into the sender's thread, and a footer
 * explains how to opt out of these emails.
 */
export async function sendNewMessageEmail(opts: {
  community: BrandSource
  to: string
  recipientName: string
  senderName: string
  preview: string
  senderId: string
}) {
  const { community, to, recipientName, senderName, preview, senderId } = opts
  const brand = emailBrand(community)
  const threadUrl = `${brand.origin}/messages?to=${encodeURIComponent(senderId)}`
  const prefsUrl = `${brand.origin}/profile#notifications`
  const safePreview = escapeHtml(preview).slice(0, 280)

  const html = `
    <p>Hi ${escapeHtml(recipientName)},</p>
    <p><strong style="color:#C8A848">${escapeHtml(senderName)}</strong> sent you a message on ${brand.name}:</p>
    <blockquote style="margin:18px 0;padding:12px 16px;border-left:3px solid #C8A848;background:rgba(200,168,72,0.06);color:#3a2b14;font-style:italic;border-radius:6px">
      ${safePreview}${preview.length > 280 ? '…' : ''}
    </blockquote>
    <p style="margin:24px 0">
      <a href="${threadUrl}" style="display:inline-block;background:#C8A848;color:#1A0A24;text-decoration:none;padding:11px 22px;border-radius:8px;font-weight:bold">Read &amp; reply ✦</a>
    </p>
    <p style="font-size:12px;color:#8a8a8a;margin-top:28px">
      You're receiving this because you have message email notifications turned on.
      <a href="${prefsUrl}" style="color:#8a8a8a">Manage your notification preferences</a>.
    </p>`

  return sendUserEmail(community, to, `${senderName} messaged you on ${brand.name}`, html)
}

/**
 * Notify a member they were @mentioned in a group thread. Links straight into
 * the group's thread. Sent even when group threads are otherwise quiet — a
 * mention is a deliberate, targeted signal.
 */
export async function sendGroupMentionEmail(opts: {
  community: BrandSource
  to: string
  recipientName: string
  senderName: string
  groupName: string
  groupId: string
  preview: string
}) {
  const { community, to, recipientName, senderName, groupName, groupId, preview } = opts
  const brand = emailBrand(community)
  const threadUrl = `${brand.origin}/messages/g/${encodeURIComponent(groupId)}`
  const prefsUrl = `${brand.origin}/profile#notifications`
  const safePreview = escapeHtml(preview).slice(0, 280)

  const html = `
    <p>Hi ${escapeHtml(recipientName)},</p>
    <p><strong style="color:#C8A848">${escapeHtml(senderName)}</strong> mentioned you in <strong>${escapeHtml(groupName)}</strong> on ${brand.name}:</p>
    <blockquote style="margin:18px 0;padding:12px 16px;border-left:3px solid #C8A848;background:rgba(200,168,72,0.06);color:#3a2b14;font-style:italic;border-radius:6px">
      ${safePreview}${preview.length > 280 ? '…' : ''}
    </blockquote>
    <p style="margin:24px 0">
      <a href="${threadUrl}" style="display:inline-block;background:#C8A848;color:#1A0A24;text-decoration:none;padding:11px 22px;border-radius:8px;font-weight:bold">View the thread ✦</a>
    </p>
    <p style="font-size:12px;color:#8a8a8a;margin-top:28px">
      You're receiving this because you were mentioned and have message email notifications turned on.
      <a href="${prefsUrl}" style="color:#8a8a8a">Manage your notification preferences</a>.
    </p>`

  await sendUserEmail(community, to, `${senderName} mentioned you in ${groupName}`, html)
}

/**
 * Notify a member who opted into email for a group thread that there's new
 * activity. Sent at most once per quiet period (throttled in the route), so it
 * behaves like a "the thread is active again" nudge rather than per-message spam.
 */
export async function sendGroupActivityEmail(opts: {
  community: BrandSource
  to: string
  recipientName: string
  senderName: string
  groupName: string
  groupId: string
  preview: string
}) {
  const { community, to, recipientName, senderName, groupName, groupId, preview } = opts
  const brand = emailBrand(community)
  const threadUrl = `${brand.origin}/messages/g/${encodeURIComponent(groupId)}`
  const prefsUrl = `${brand.origin}/profile#notifications`
  const safePreview = escapeHtml(preview).slice(0, 280)

  const html = `
    <p>Hi ${escapeHtml(recipientName)},</p>
    <p>New activity in <strong style="color:#C8A848">${escapeHtml(groupName)}</strong> on ${brand.name}:</p>
    <blockquote style="margin:18px 0;padding:12px 16px;border-left:3px solid #C8A848;background:rgba(200,168,72,0.06);color:#3a2b14;font-style:italic;border-radius:6px">
      <strong>${escapeHtml(senderName)}:</strong> ${safePreview}${preview.length > 280 ? '…' : ''}
    </blockquote>
    <p style="margin:24px 0">
      <a href="${threadUrl}" style="display:inline-block;background:#C8A848;color:#1A0A24;text-decoration:none;padding:11px 22px;border-radius:8px;font-weight:bold">Open the thread ✦</a>
    </p>
    <p style="font-size:12px;color:#8a8a8a;margin-top:28px">
      You're receiving this because you turned on email for this group. Open the thread to mute or turn it off, or
      <a href="${prefsUrl}" style="color:#8a8a8a">manage your notification preferences</a>.
    </p>`

  await sendUserEmail(community, to, `New activity in ${groupName}`, html)
}

/**
 * Announce a new lead-up gathering (planning/brainstorm session) to a member.
 * Links to the /schedule page where they can read details and RSVP. Gated by
 * the recipient's `email_announcements` preference (checked by the caller).
 */
export async function sendLeadUpGatheringEmail(opts: {
  community: BrandSource
  to: string
  recipientName: string
  title: string
  when: string | null
  location: string | null
  link: string | null
  imageUrl?: string | null
}) {
  const { community, to, recipientName, title, when, location, link, imageUrl } = opts
  const brand = emailBrand(community)
  const scheduleUrl = `${brand.origin}/schedule`
  const prefsUrl = `${brand.origin}/profile#notifications`

  const banner = imageUrl
    ? `<img src="${encodeURI(imageUrl)}" alt="" style="width:100%;max-height:200px;object-fit:cover;border-radius:8px;margin:0 0 16px" />`
    : ''

  const detailRows = [
    when ? `<p style="margin:4px 0"><strong>When:</strong> ${escapeHtml(when)}</p>` : '',
    location ? `<p style="margin:4px 0"><strong>Where:</strong> ${escapeHtml(location)}</p>` : '',
    link ? `<p style="margin:4px 0"><strong>Link:</strong> <a href="${encodeURI(link)}" style="color:#634D0B">${escapeHtml(link)}</a></p>` : '',
  ].join('')

  const html = `
    <p>Hi ${escapeHtml(recipientName)},</p>
    <p>A new gathering on the way to camp:</p>
    ${banner}
    <div style="margin:18px 0;padding:14px 18px;border-left:3px solid #C8A848;background:rgba(200,168,72,0.06);color:#3a2b14;border-radius:6px">
      <p style="margin:0 0 6px;font-size:17px;color:#634D0B"><strong>${escapeHtml(title)}</strong></p>
      ${detailRows}
    </div>
    <p style="margin:24px 0">
      <a href="${scheduleUrl}" style="display:inline-block;background:#C8A848;color:#1A0A24;text-decoration:none;padding:11px 22px;border-radius:8px;font-weight:bold">View &amp; RSVP ✦</a>
    </p>
    <p style="font-size:12px;color:#8a8a8a;margin-top:28px">
      You're receiving this because you have announcement emails turned on.
      <a href="${prefsUrl}" style="color:#8a8a8a">Manage your notification preferences</a>.
    </p>`

  return sendUserEmail(community, to, `New gathering: ${title}`, html)
}

/**
 * Daily attunement nudge: the member's outstanding checklist, exactly as the
 * home banner / profile card compute it. Required tasks are the headline
 * (they gate "Attuned"); commitment items ride along in a gentler section —
 * a guide to what the member signed up for, never a blocker. Gated by the
 * recipient's `email_attunement_nudges` preference (checked by the caller).
 */
export async function sendAttunementNudgeEmail(opts: {
  community: BrandSource
  to: string
  recipientName: string
  required: { label: string; href?: string }[]
  commitments: { label: string; href?: string }[]
  eventName: string
  daysUntil: number
}) {
  const { community, to, recipientName, required, commitments, eventName, daysUntil } = opts
  const brand = emailBrand(community)
  const prefsUrl = `${brand.origin}/profile#notifications`

  const taskList = (items: { label: string; href?: string }[]) => `
    <ul style="margin:10px 0 18px;padding-left:0;list-style:none">
      ${items.map(t => `
        <li style="margin:6px 0;padding:9px 14px;border-left:3px solid #C8A848;background:rgba(200,168,72,0.06);border-radius:6px;color:#3a2b14">
          ✦&nbsp; ${t.href
            ? `<a href="${brand.origin}${encodeURI(t.href)}" style="color:#634D0B;text-decoration:none;font-weight:bold">${escapeHtml(t.label)}</a>`
            : `<strong>${escapeHtml(t.label)}</strong>`}
        </li>`).join('')}
    </ul>`

  const countdown = daysUntil > 0
    ? `${escapeHtml(eventName)} gathers in <strong>${daysUntil} day${daysUntil === 1 ? '' : 's'}</strong>.`
    : `${escapeHtml(eventName)} is here.`

  const requiredBlock = required.length
    ? `<p style="margin:18px 0 0">To complete your attunement:</p>${taskList(required)}`
    : ''
  const commitmentsBlock = commitments.length
    ? `<p style="margin:18px 0 0;color:#6b5a3e">And from the commitments you've taken on:</p>${taskList(commitments)}`
    : ''

  const n = required.length
  const subject = n > 0
    ? `Your attunement awaits — ${n} step${n === 1 ? '' : 's'} remain${n === 1 ? 's' : ''}`
    : 'A gentle word about your commitments'

  const html = `
    <p>Hi ${escapeHtml(recipientName)},</p>
    <p>${countdown} The triangle holds, the eye witnesses — and a few things still await your hands:</p>
    ${requiredBlock}
    ${commitmentsBlock}
    <p style="margin:24px 0">
      <a href="${brand.origin}/profile" style="display:inline-block;background:#C8A848;color:#1A0A24;text-decoration:none;padding:11px 22px;border-radius:8px;font-weight:bold">Complete your attunement ✦</a>
    </p>
    <p style="font-size:12px;color:#8a8a8a;margin-top:28px">
      You're receiving this because you have outstanding attunement tasks and attunement reminders turned on.
      <a href="${prefsUrl}" style="color:#8a8a8a">Manage your notification preferences</a>.
    </p>`

  return sendUserEmail(community, to, subject, html)
}

// One gathering or shift as it appears in a confirmation / reminder email.
export type ReminderItem = {
  kind: 'gathering' | 'shift'
  title: string
  whenText: string  // human "when", e.g. "Sat, Jul 22 · 7:00 PM"
  href: string      // absolute URL or an app-relative path ("/schedule")
}

/**
 * Immediate confirmation when a member RSVPs to a lead-up gathering or signs up
 * for a shift ("you're in"). Transactional, but still gated by the recipient's
 * `email_event_reminders` preference (checked by the caller) so one switch turns
 * off all gathering/shift email.
 */
export async function sendSignupConfirmationEmail(opts: {
  community: BrandSource
  to: string
  recipientName: string
  kind: 'gathering' | 'shift'
  title: string
  whenText: string
  location?: string | null
  href: string
}) {
  const { community, to, recipientName, kind, title, whenText, location, href } = opts
  const brand = emailBrand(community)
  const prefsUrl = `${brand.origin}/profile#notifications`
  const url = href.startsWith('http') ? href : `${brand.origin}${href}`
  const lead = kind === 'gathering' ? "You're on the list for this gathering:" : "You're signed up for this shift:"
  const locRow = location ? `<p style="margin:4px 0"><strong>Where:</strong> ${escapeHtml(location)}</p>` : ''

  const html = `
    <p>Hi ${escapeHtml(recipientName)},</p>
    <p>${lead}</p>
    <div style="margin:18px 0;padding:14px 18px;border-left:3px solid #C8A848;background:rgba(200,168,72,0.06);color:#3a2b14;border-radius:6px">
      <p style="margin:0 0 6px;font-size:17px;color:#634D0B"><strong>${escapeHtml(title)}</strong></p>
      <p style="margin:4px 0"><strong>When:</strong> ${escapeHtml(whenText)}</p>
      ${locRow}
    </div>
    <p style="margin:24px 0">
      <a href="${encodeURI(url)}" style="display:inline-block;background:#C8A848;color:#1A0A24;text-decoration:none;padding:11px 22px;border-radius:8px;font-weight:bold">View details ✦</a>
    </p>
    <p style="font-size:12px;color:#8a8a8a;margin-top:28px">
      We'll send a reminder before it. You're receiving this because you have gathering &amp; shift emails turned on.
      <a href="${prefsUrl}" style="color:#8a8a8a">Manage your notification preferences</a>.
    </p>`

  const subject = kind === 'gathering' ? `You're in: ${title}` : `Shift confirmed: ${title}`
  return sendUserEmail(community, to, subject, html)
}

/**
 * Batched reminder — one email per member per phase per day, listing every
 * gathering + shift they have that day. `phase` is 'day_before' (sent the
 * evening before) or 'morning_of' (sent that morning). Gated by the recipient's
 * `email_event_reminders` preference (checked by the caller).
 */
export async function sendEventReminderEmail(opts: {
  community: BrandSource
  to: string
  recipientName: string
  phase: 'day_before' | 'morning_of'
  items: ReminderItem[]
  // Footer-button target. Volunteers get '/participate' — /schedule is
  // member-gated and would bounce them to /profile.
  schedulePath?: string
}) {
  const { community, to, recipientName, phase, items, schedulePath = '/schedule' } = opts
  const brand = emailBrand(community)
  const prefsUrl = `${brand.origin}/profile#notifications`
  const whenWord = phase === 'day_before' ? 'tomorrow' : 'today'

  const list = `
    <ul style="margin:10px 0 18px;padding-left:0;list-style:none">
      ${items.map(it => {
        const url = it.href.startsWith('http') ? it.href : `${brand.origin}${it.href}`
        const tag = it.kind === 'gathering' ? 'Gathering' : 'Shift'
        return `
        <li style="margin:6px 0;padding:9px 14px;border-left:3px solid #C8A848;background:rgba(200,168,72,0.06);border-radius:6px;color:#3a2b14">
          <span style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#8a7a4a">${tag}</span><br/>
          <a href="${encodeURI(url)}" style="color:#634D0B;text-decoration:none;font-weight:bold">${escapeHtml(it.title)}</a>
          <span style="color:#6b5a3e"> — ${escapeHtml(it.whenText)}</span>
        </li>`
      }).join('')}
    </ul>`

  const count = items.length
  const subject = phase === 'day_before'
    ? (count === 1 ? `Tomorrow: ${items[0].title}` : `${count} things on your ${brand.name} calendar tomorrow`)
    : (count === 1 ? `Today: ${items[0].title}` : `${count} things on your ${brand.name} calendar today`)

  const html = `
    <p>Hi ${escapeHtml(recipientName)},</p>
    <p>A gentle reminder — here's what you have coming up ${whenWord}:</p>
    ${list}
    <p style="margin:24px 0">
      <a href="${brand.origin}${schedulePath}" style="display:inline-block;background:#C8A848;color:#1A0A24;text-decoration:none;padding:11px 22px;border-radius:8px;font-weight:bold">View your schedule ✦</a>
    </p>
    <p style="font-size:12px;color:#8a8a8a;margin-top:28px">
      You're receiving this because you have gathering &amp; shift reminders turned on.
      <a href="${prefsUrl}" style="color:#8a8a8a">Manage your notification preferences</a>.
    </p>`

  return sendUserEmail(community, to, subject, html)
}

/**
 * Notify a member they were @mentioned in a Radio post. Gated by the
 * recipient's message-notification preference (checked at the seam).
 */
export async function sendRadioMentionEmail(opts: {
  community: BrandSource
  to: string
  recipientName: string
  senderName: string
  preview: string
}) {
  const { community, to, recipientName, senderName, preview } = opts
  const brand = emailBrand(community)
  const radioUrl = `${brand.origin}/radio`
  const prefsUrl = `${brand.origin}/profile#notifications`
  const safePreview = escapeHtml(preview).slice(0, 280)

  const html = wrap(brand, `
    <p>Hi ${escapeHtml(recipientName)},</p>
    <p><strong style="color:#634D0B">${escapeHtml(senderName)}</strong> mentioned you on ${brand.name} Radio:</p>
    <blockquote style="margin:18px 0;padding:12px 16px;border-left:3px solid #C8A848;background:rgba(200,168,72,0.06);color:#3a2b14;font-style:italic;border-radius:6px">
      ${safePreview}${preview.length > 280 ? '…' : ''}
    </blockquote>
    <p style="margin:24px 0">
      <a href="${radioUrl}" style="display:inline-block;background:#C8A848;color:#1A0A24;text-decoration:none;padding:11px 22px;border-radius:8px;font-weight:bold">Tune in ✦</a>
    </p>
    <p style="font-size:12px;color:#8a8a8a;margin-top:28px">
      You're receiving this because you were mentioned and have message email notifications turned on.
      <a href="${prefsUrl}" style="color:#8a8a8a">Manage your notification preferences</a>.
    </p>`)

  await sendUserEmail(community, to, `${senderName} mentioned you on Radio`, html)
}

/**
 * The "notify everyone" megaphone: a Radio post that deliberately rings the
 * whole camp. Gated by the recipient's announcement preference (checked by the
 * caller). Mirrors the organizer-broadcast email so both read the same.
 */
export async function sendRadioBroadcastEmail(opts: {
  community: BrandSource
  to: string
  recipientName: string
  senderName: string
  message: string
}) {
  const { community, to, recipientName, senderName, message } = opts
  const brand = emailBrand(community)
  const radioUrl = `${brand.origin}/radio`
  const prefsUrl = `${brand.origin}/profile#notifications`
  const safeMessage = escapeHtml(message).slice(0, 400)

  const html = wrap(brand, `
    <p>Hi ${escapeHtml(recipientName)},</p>
    <p>📢 <strong style="color:#634D0B">${escapeHtml(senderName)}</strong> is on the air:</p>
    <blockquote style="margin:18px 0;padding:12px 16px;border-left:3px solid #C8A848;background:rgba(200,168,72,0.06);color:#3a2b14;font-style:italic;border-radius:6px">
      ${safeMessage}${message.length > 400 ? '…' : ''}
    </blockquote>
    <p style="margin:24px 0">
      <a href="${radioUrl}" style="display:inline-block;background:#C8A848;color:#1A0A24;text-decoration:none;padding:11px 22px;border-radius:8px;font-weight:bold">Tune in to Radio ✦</a>
    </p>
    <p style="font-size:12px;color:#8a8a8a;margin-top:28px">
      You're receiving this because you have announcement emails turned on.
      <a href="${prefsUrl}" style="color:#8a8a8a">Manage your notification preferences</a>.
    </p>`)

  await sendUserEmail(community, to, `${senderName} on Radio: ${message.slice(0, 60)}${message.length > 60 ? '…' : ''}`, html)
}

// ── Helpers ───────────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// Light branded wrapper so all emails look consistent and professional.
function wrap(brand: EmailBrand, inner: string): string {
  const wordmark = escapeHtml(brand.name.toUpperCase().split('').join(' '))
  return `
  <div style="font-family:Georgia,'Times New Roman',serif;max-width:560px;margin:0 auto;padding:8px;color:#2a2018">
    <div style="text-align:center;padding:18px 0 8px">
      <span style="font-size:22px;letter-spacing:0.15em;color:#634D0B">${wordmark}</span>
    </div>
    <div style="background:#fbf7ee;border:1px solid #e6d9b8;border-radius:14px;padding:24px 28px;line-height:1.6">
      ${inner}
    </div>
    <p style="text-align:center;font-size:11px;color:#a59a86;margin:16px 0 8px">${escapeHtml(brand.name)} · Many Hands</p>
  </div>`
}
