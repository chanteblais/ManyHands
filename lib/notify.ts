import { getNotificationPreferences, type NotificationPreferences } from '@/lib/notification-prefs'
import { sendPushToMember, type PushPayload } from '@/lib/push'
import type { Community } from '@/lib/community'
import { isDemoCommunity } from '@/lib/demo'

// THE notification dispatch seam (docs/mobile-companion.md → standing
// disciplines): member + event → their channels. Every member-facing
// notification goes through here so channels stay additive — email today,
// native push the moment the app ships, without touching producers again.
//
// One preference toggle governs a kind across all channels (config restraint:
// members think "notify me about messages", not "email me about messages");
// per-channel preferences can split later if members ask.

export type NotificationKind =
  | 'new_message' // DMs, group mentions, group activity
  | 'announcement' // organizer announcements / broadcasts
  | 'application' // application status changes
  | 'attunement_nudge' // scheduled attunement reminders

const PREF_FOR_KIND: Record<NotificationKind, keyof NotificationPreferences> = {
  new_message: 'email_new_message',
  announcement: 'email_announcements',
  application: 'email_application',
  attunement_nudge: 'email_attunement_nudges',
}

export type MemberNotification = {
  kind: NotificationKind
  /** Shown on the device: title + body + the internal path a tap opens. */
  push: PushPayload
  /**
   * The purpose-built email sender for this event (from lib/send-email.ts),
   * wrapped in a thunk so the seam controls whether it runs. Omit when the
   * caller's own throttle already decided email shouldn't fire this time —
   * push still goes out (per-message push + throttled email is the native
   * rhythm).
   */
  email?: () => Promise<unknown>
  /** Pass when the caller already fetched prefs (saves the lookup). */
  prefs?: NotificationPreferences
}

/**
 * Deliver one notification to one member via every channel their preference
 * allows. Channels run in parallel; failures are logged, never thrown — a
 * notification must never break the action that caused it. A demo community
 * (lib/demo.ts) notifies nobody.
 */
export async function dispatchMemberNotification(
  community: Pick<Community, 'settings'>,
  clerkUserId: string,
  notification: MemberNotification
): Promise<void> {
  if (isDemoCommunity(community)) return
  try {
    const prefs = notification.prefs ?? (await getNotificationPreferences(clerkUserId))
    if (!prefs[PREF_FOR_KIND[notification.kind]]) return

    await Promise.all([
      sendPushToMember(clerkUserId, notification.push),
      notification.email
        ? notification.email().catch((err) => {
            console.error(`[notify] email channel failed (${notification.kind}):`, err)
          })
        : Promise.resolve(),
    ])
  } catch (err) {
    console.error(`[notify] dispatch failed (${notification.kind}):`, err)
  }
}
