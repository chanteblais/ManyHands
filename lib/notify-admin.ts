import { clerkClient } from '@clerk/nextjs/server'
import type { Community } from '@/lib/community'
import { tenantDb } from '@/lib/tenant-db'
import { sendAdminEmail } from '@/lib/send-email'

type NotifyAdminInput = {
  applicationId?: string | null
  eventType: 'new_application' | 'profile_updated' | 'attendance_cancelled' | 'attendance_suspended' | 'suspension_lifted' | 'volunteer_cancelled' | 'volunteer_signup' | 'dues_reported'
  message: string
  details?: Record<string, unknown>
}

export async function notifyAdmin(community: Community, input: NotifyAdminInput): Promise<void> {
  const { error } = await tenantDb(community.id).from('admin_notifications').insert([
    {
      application_id: input.applicationId ?? null,
      event_type: input.eventType,
      message: input.message,
      details: input.details ?? null,
    },
  ])

  if (error) {
    console.error('[notifyAdmin] Failed to insert notification:', error.message)
  }

  const detailLines = input.details
    ? Object.entries(input.details).map(([k, v]) => `<p style="margin:4px 0"><b>${k}:</b> ${v}</p>`).join('')
    : ''

  // Recipients are still the Clerk-instance-wide admins (publicMetadata.role);
  // branch 1d switches this to `members.role = 'admin'` in this community.
  try {
    const client = await clerkClient()
    const { data: users } = await client.users.getUserList({ limit: 100 })
    const adminEmails = users
      .filter(u => u.publicMetadata?.role === 'admin')
      .flatMap(u => u.emailAddresses.map(e => e.emailAddress))

    for (const email of adminEmails) {
      await sendAdminEmail(community, email, `${community.name}: ${input.message}`, `<p>${input.message}</p>${detailLines}`)
    }
  } catch (err) {
    console.error('[notifyAdmin] Failed to send email:', err)
  }
}

export function formatFieldLabel(field: string): string {
  return field
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

export function summarizeChanges(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  fields: string[]
): Record<string, { from: unknown; to: unknown }> {
  const changes: Record<string, { from: unknown; to: unknown }> = {}

  for (const field of fields) {
    const prev = before[field]
    const next = after[field]
    const prevNorm = Array.isArray(prev) ? prev.join(', ') : prev ?? null
    const nextNorm = Array.isArray(next) ? next.join(', ') : next ?? null
    if (String(prevNorm) !== String(nextNorm)) {
      changes[field] = { from: prevNorm, to: nextNorm }
    }
  }

  return changes
}
