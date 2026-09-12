import { globalDb } from '@/lib/tenant-db'

export type NotificationPreferences = {
  email_new_message: boolean
  email_announcements: boolean
  email_application: boolean
  email_attunement_nudges: boolean
  // Governs ALL gathering/shift emails: signup confirmations + the
  // day-before / morning-of reminders (migration 066).
  email_event_reminders: boolean
}

export const DEFAULT_PREFERENCES: NotificationPreferences = {
  email_new_message: true,
  email_announcements: true,
  email_application: true,
  email_attunement_nudges: true,
  email_event_reminders: true,
}

const ALL_OFF: NotificationPreferences = {
  email_new_message: false,
  email_announcements: false,
  email_application: false,
  email_attunement_nudges: false,
  email_event_reminders: false,
}

/**
 * Fetch a member's notification preferences. A missing row means the member
 * has never changed anything — return all defaults (ON).
 *
 * A QUERY ERROR is different: we can no longer tell whether the member opted
 * out, so send paths must fail CLOSED (all OFF — skip the email rather than
 * override a possible opt-out). Pass `onError: 'defaults'` only where the
 * result renders instead of gating a send (the profile toggles).
 */
export async function getNotificationPreferences(
  clerkUserId: string,
  opts?: { onError?: 'all-off' | 'defaults' }
): Promise<NotificationPreferences> {
  const { data, error } = await globalDb()
    .from('notification_preferences')
    .select('email_new_message, email_announcements, email_application, email_attunement_nudges, email_event_reminders')
    .eq('clerk_user_id', clerkUserId)
    .maybeSingle()

  if (error) {
    console.error('[notification-prefs] lookup failed:', error)
    return opts?.onError === 'defaults' ? { ...DEFAULT_PREFERENCES } : { ...ALL_OFF }
  }
  if (!data) return { ...DEFAULT_PREFERENCES }

  return {
    email_new_message: data.email_new_message ?? true,
    email_announcements: data.email_announcements ?? true,
    email_application: data.email_application ?? true,
    email_attunement_nudges: data.email_attunement_nudges ?? true,
    email_event_reminders: data.email_event_reminders ?? true,
  }
}
