import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getCommunity } from '@/lib/community'
import { getUnreadCount } from '@/lib/conversations'

export const dynamic = 'force-dynamic'

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ count: 0 })

  try {
    const count = await getUnreadCount((await getCommunity()).id, userId)
    return NextResponse.json({ count }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ count: 0 })
  }
}
