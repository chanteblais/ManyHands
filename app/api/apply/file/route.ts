import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getCommunity } from '@/lib/community'
import { tenantDb, objectPath } from '@/lib/tenant-db'
import { requireAdmin } from '@/lib/admin-auth'
import { APPLICATION_FILES_BUCKET, APPLICATION_FILE_ROUTE } from '@/lib/application-files'
import { bytesMatchType } from '@/lib/file-sniff'

// Generic file attachments for admin-added "File upload" application fields.
// Stored in the PRIVATE `application-files` bucket (migration 072), namespaced
// by user. POST uploads and returns an href to this route; GET is the only way
// to read an object — owner-or-admin, then a redirect to a short-lived signed
// URL. Answers never store a storage URL directly.
const ALLOWED_TYPES = [
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
]
const MAX_BYTES = 10 * 1024 * 1024 // 10 MB per file
// Per-user quota — an authenticated stranger shouldn't be able to fill the
// bucket. Generous for real applicants (a form has a handful of file fields;
// replacements don't delete the old object, so leave headroom).
const MAX_FILES_PER_USER = 30
const MAX_TOTAL_BYTES_PER_USER = 100 * 1024 * 1024 // 100 MB

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const community = await getCommunity()
  const db = tenantDb(community.id)

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: 'Unsupported file type. Allowed: images, PDF, Word, or text.' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'File must be under 10 MB' }, { status: 400 })
  }

  // Quota check against what this user already has in their folder.
  const { data: existing, error: listError } = await db.storage
    .from(APPLICATION_FILES_BUCKET)
    .list(objectPath(community.id, userId), { limit: MAX_FILES_PER_USER + 1 })
  if (listError) {
    console.error('[application file upload] quota list failed:', listError)
    return NextResponse.json({ error: 'Upload failed. Please try again.' }, { status: 500 })
  }
  const totalBytes = (existing ?? []).reduce((sum, o) => sum + (Number(o.metadata?.size) || 0), 0)
  if ((existing ?? []).length >= MAX_FILES_PER_USER || totalBytes + file.size > MAX_TOTAL_BYTES_PER_USER) {
    return NextResponse.json({ error: 'Upload limit reached. Please contact an organizer if you need to attach more files.' }, { status: 429 })
  }

  // Preserve a readable name, but sanitise and prefix with a timestamp so
  // re-uploads don't collide.
  const safeName = (file.name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80)
  const path = objectPath(community.id, `${userId}/${Date.now()}-${safeName}`)
  const buffer = Buffer.from(await file.arrayBuffer())

  // The declared type is client-controlled — verify the bytes match it before
  // storing (lib/file-sniff.ts; blocks e.g. HTML relabelled as PDF).
  if (!bytesMatchType(file.type, buffer)) {
    return NextResponse.json({ error: 'File content does not match its type.' }, { status: 400 })
  }

  const { error: uploadError } = await db.storage
    .from(APPLICATION_FILES_BUCKET)
    .upload(path, buffer, { contentType: file.type, upsert: false, cacheControl: '31536000' })

  if (uploadError) {
    console.error('[application file upload]', uploadError)
    return NextResponse.json({ error: uploadError.message }, { status: 500 })
  }

  return NextResponse.json({
    url: `${APPLICATION_FILE_ROUTE}?path=${encodeURIComponent(path)}`,
    name: file.name || safeName,
  })
}

// GET ?path=<communityId>/<userId>/<file> (or the pre-tenancy <userId>/<file>)
// — the read gate for the private bucket. The uploader may read their own
// folder; admins of THIS community may read anything in it (they review
// applications). Everyone else gets nothing, URL or no URL.
export async function GET(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const community = await getCommunity()
  const db = tenantDb(community.id)

  const path = req.nextUrl.searchParams.get('path') ?? ''
  const segments = path.split('/')
  if (![2, 3].includes(segments.length) || segments.some(s => !s || s === '.' || s === '..' || !/^[A-Za-z0-9._-]+$/.test(s))) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 })
  }
  // Prefixed objects belong to exactly one community; a different community's
  // admin never sees them. Legacy two-segment paths are Glåüm's (pre-074).
  if (segments.length === 3 && segments[0] !== community.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const ownerId = segments.length === 3 ? segments[1] : segments[0]

  if (ownerId !== userId && !(await requireAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data, error } = await db.storage
    .from(APPLICATION_FILES_BUCKET)
    .createSignedUrl(path, 60)
  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 })
  }

  return NextResponse.redirect(data.signedUrl, 302)
}
