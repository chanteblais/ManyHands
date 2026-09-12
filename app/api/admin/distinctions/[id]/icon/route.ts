import { NextRequest, NextResponse } from 'next/server'
import { tenantDb, objectPath } from '@/lib/tenant-db'
import { getCommunity } from '@/lib/community'
import { normalizeIconImage } from '@/lib/icon-image'
import { requireAdmin } from '@/lib/admin-auth'

const ALLOWED_TYPES = ['image/png', 'image/webp', 'image/svg+xml', 'image/jpeg', 'image/gif']
const MAX_BYTES = 5 * 1024 * 1024 // 5 MB
// Reuse the public `group-badges` bucket (a distinction medal is the same kind of
// patch-style art as a group icon). Distinction objects live under a `distinctions/`
// prefix so they never collide with group icons. The resulting URL is stored in the
// rule's `image` field inside the `config_distinctions` JSON, not in a DB column —
// so unlike the group route there is nothing to update server-side.
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

  // Normalize every upload onto the standard frame so all medals render at the
  // same size (see lib/icon-image.ts). On failure, fall back to the raw file
  // rather than blocking the upload. Output is always PNG.
  let buffer: Buffer = original
  try {
    buffer = await normalizeIconImage(original)
  } catch (err) {
    console.error('[distinction icon normalize]', err)
  }

  // Path includes the distinction id so re-uploading the same medal overwrites in
  // place. The id comes from the JSON config and is URL-safe (kebab/`distinction-<ts>`).
  const path = objectPath(community.id, `distinctions/${params.id}/badge.png`)

  const { error: uploadError } = await db.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: 'image/png', upsert: true, cacheControl: '31536000' })

  if (uploadError) {
    console.error('[distinction icon upload]', uploadError)
    return NextResponse.json({ error: uploadError.message }, { status: 500 })
  }

  const { data: { publicUrl } } = db.storage.from(BUCKET).getPublicUrl(path)
  // Bust CDN cache so a re-upload shows immediately.
  const image = `${publicUrl}?v=${Date.now()}`

  return NextResponse.json({ image })
}
