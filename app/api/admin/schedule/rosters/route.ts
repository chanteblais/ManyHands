import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { getAdminRosters } from '@/lib/admin-program-data'
import { getCommunity } from '@/lib/community'

// Who holds each shift, for the admin schedule editor's per-event roster.
// Assembly lives in lib/admin-program-data.ts (shared with /admin/program's
// server render); this route is the client's refresh path.
export type { RosterEntry } from '@/lib/admin-program-data'

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const community = await getCommunity()

  try {
    return NextResponse.json({ rosters: await getAdminRosters(community.id) })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
