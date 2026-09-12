import { tenantDb } from '@/lib/tenant-db'

export type OwnedApplication = Record<string, unknown> & {
  id: string
  status: string
  email: string
  clerk_user_id: string | null
}

export async function getOwnedApplication(
  communityId: string,
  userId: string,
  email: string | undefined
): Promise<OwnedApplication | null> {
  const filters = [`clerk_user_id.eq.${userId}`]
  if (email) filters.push(`email.eq.${email}`)

  const { data } = await tenantDb(communityId)
    .from('applications')
    .select('*')
    .or(filters.join(','))
    .order('submitted_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return data as OwnedApplication | null
}

export function canEditApplication(application: OwnedApplication): boolean {
  return application.status === 'approved' || application.status === 'pending'
}

export function canCancelApplication(application: OwnedApplication): boolean {
  return application.status === 'approved' || application.status === 'pending'
}
