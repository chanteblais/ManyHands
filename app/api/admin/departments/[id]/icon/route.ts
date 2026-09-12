import { NextRequest, NextResponse } from 'next/server'
import { tenantDb } from '@/lib/tenant-db'
import { getCommunity } from '@/lib/community'
import { normalizeIconImage } from '@/lib/icon-image'
import { requireAdmin } from '@/lib/admin-auth'

const ALLOWED_TYPES = ['image/png', 'image/webp', 'image/svg+xml', 'image/jpeg', 'image/gif']
const MAX_BYTES = 5 * 1024 * 1024 // 5 MB
// Reuse the public `group-badges` bucket (department icons are the same patch-style
// art as group icons / distinction medals). Objects live under a `departments/`
// prefix. The `[id]` segment is just a stable storage key: for an existing
// department it's the row id; for a not-yet-saved one the client passes a generated
// key, so uploads work before the department exists. The resulting URL is written
// into `departments.icon` when the modal is saved (no server-side DB write here).
const BUCKET = 'group-badges'

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const community = await getCommunity()
  const db = tenantDb(community.id)

  const formData = await req.formData()
  const file = formData.get('icon') as File | null
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: 'File must be a PNG, WebP, SVG, JPEG, or GIF' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'File must be under 5 MB' }, { status: 400 })
  }

  const original = Buffer.from(await file.arrayBuffer())

  // Normalize onto the standard frame so every icon renders at a uniform size
  // (see lib/icon-image.ts). Fall back to the raw file on failure. Output is PNG.
  let buffer: Buffer = original
  try {
    buffer = await normalizeIconImage(original)
  } catch (err) {
    console.error('[department icon normalize]', err)
  }

  const path = `departments/${params.id}/icon.png`

  const { error: uploadError } = await db.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: 'image/png', upsert: true, cacheControl: '31536000' })

  if (uploadError) {
    console.error('[department icon upload]', uploadError)
    return NextResponse.json({ error: uploadError.message }, { status: 500 })
  }

  const { data: { publicUrl } } = db.storage.from(BUCKET).getPublicUrl(path)
  // Bust CDN cache so a re-upload shows immediately.
  const image = `${publicUrl}?v=${Date.now()}`

  return NextResponse.json({ image })
}
