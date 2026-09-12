import { NextRequest, NextResponse } from 'next/server'
import { tenantDb } from '@/lib/tenant-db'
import { getCommunity } from '@/lib/community'
import { requireAdmin } from '@/lib/admin-auth'

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']
const MAX_BYTES = 2 * 1024 * 1024 // 2 MB

export async function POST(req: NextRequest) {
  const userId = await requireAdmin()
  if (!userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const community = await getCommunity()
  const db = tenantDb(community.id)

  const formData = await req.formData()
  const file = formData.get('icon') as File | null
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: 'File must be PNG, JPG, WebP, or SVG' }, { status: 400 })
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'File must be under 2 MB' }, { status: 400 })
  }

  const ext = file.type === 'image/svg+xml' ? 'svg' : file.type.split('/')[1].replace('jpeg', 'jpg')
  const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())

  const { error: uploadError } = await db.storage
    .from('schedule-icons')
    .upload(path, buffer, { contentType: file.type, upsert: false, cacheControl: '31536000' })

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 })
  }

  const { data: { publicUrl } } = db.storage
    .from('schedule-icons')
    .getPublicUrl(path)

  return NextResponse.json({ url: publicUrl })
}

export async function DELETE(req: NextRequest) {
  const userId = await requireAdmin()
  if (!userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const community = await getCommunity()
  const db = tenantDb(community.id)

  const { url } = await req.json()
  if (!url) return NextResponse.json({ error: 'No URL provided' }, { status: 400 })

  // Extract storage path from the public URL
  const match = (url as string).match(/schedule-icons\/(.+?)(\?|$)/)
  if (!match) return NextResponse.json({ error: 'Invalid icon URL' }, { status: 400 })
  const path = match[1]

  // Delete from storage
  const { error: storageError } = await db.storage
    .from('schedule-icons')
    .remove([path])

  if (storageError) {
    return NextResponse.json({ error: storageError.message }, { status: 500 })
  }

  // Reset any events using this icon back to 'star'
  await db
    .from('schedule_events')
    .update({ icon_type: 'star' })
    .eq('icon_type', url)

  return NextResponse.json({ success: true })
}
