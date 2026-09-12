import { NextRequest, NextResponse } from 'next/server'
import { auth, currentUser } from '@clerk/nextjs/server'
import sharp from 'sharp'
import { getCommunity } from '@/lib/community'
import { tenantDb, objectPath } from '@/lib/tenant-db'
import { upsertMember } from '@/lib/members'

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const MAX_BYTES = 5 * 1024 * 1024 // 5 MB

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const community = await getCommunity()
  const db = tenantDb(community.id)

  const formData = await req.formData()
  const file = formData.get('avatar') as File | null
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: 'File must be a JPEG, PNG, WebP, or GIF' }, { status: 400 })
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'File must be under 5 MB' }, { status: 400 })
  }

  // Normalize to a display-sized WebP so the stored object is ~100KB, not the
  // full camera original — everything downstream (raw serves and cache-miss
  // CDN transforms alike) pays for the source size. GIFs pass through
  // untouched to keep animation.
  let buffer = Buffer.from(await file.arrayBuffer())
  let contentType = file.type
  let ext = file.type.split('/')[1].replace('jpeg', 'jpg')
  if (file.type !== 'image/gif') {
    try {
      buffer = Buffer.from(
        await sharp(buffer)
          .rotate() // bake in EXIF orientation before it's stripped
          .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 82 })
          .toBuffer()
      )
      contentType = 'image/webp'
      ext = 'webp'
    } catch (err) {
      console.error('[avatar resize]', err)
      return NextResponse.json({ error: 'That file could not be read as an image' }, { status: 400 })
    }
  }
  const path = objectPath(community.id, `${userId}/avatar.${ext}`)

  // Upload (upsert so re-uploads overwrite cleanly)
  const { error: uploadError } = await db.storage
    .from('avatars')
    .upload(path, buffer, { contentType, upsert: true, cacheControl: '31536000' })

  if (uploadError) {
    console.error('[avatar upload]', uploadError)
    return NextResponse.json({ error: uploadError.message }, { status: 500 })
  }

  // Re-uploads that change extension (e.g. old avatar.jpg → avatar.webp) would
  // otherwise strand the previous object; remove() ignores missing paths.
  // …including the pre-tenancy unprefixed path this member may still have.
  const stale = ['jpg', 'png', 'webp', 'gif'].flatMap((e) => [
    ...(e !== ext ? [objectPath(community.id, `${userId}/avatar.${e}`)] : []),
    `${userId}/avatar.${e}`,
  ])
  await db.storage.from('avatars').remove(stale)

  const { data: { publicUrl } } = db.storage
    .from('avatars')
    .getPublicUrl(path)

  // Bust CDN cache by appending a timestamp query param
  const avatarUrl = `${publicUrl}?v=${Date.now()}`

  // Update whichever record(s) belong to this user
  const user = await currentUser()
  const email = user?.emailAddresses[0]?.emailAddress

  await db
    .from('applications')
    .update({ avatar_url: avatarUrl })
    .or(`clerk_user_id.eq.${userId}${email ? `,email.eq.${email}` : ''}`)

  await db
    .from('volunteers')
    .update({ avatar_url: avatarUrl })
    .eq('clerk_user_id', userId)

  // Dual-write: mirror the new avatar onto the canonical member record — but
  // update-only. This route carries no identity (a volunteer's name/email lives
  // in `volunteers`, not here), so inserting would create a nameless, emailless
  // phantom member for every signed-in non-member. Members are created on
  // apply/approve, where identity is present.
  await upsertMember(community.id, userId, { avatar_url: avatarUrl }, undefined, { updateOnly: true })

  return NextResponse.json({ avatarUrl })
}
