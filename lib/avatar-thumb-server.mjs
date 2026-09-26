// Server-only half of lib/avatar-thumb.mjs: encodes the thumbnail.
import sharp from 'sharp'
import { AVATAR_THUMB_SIZE } from './avatar-thumb.mjs'

/**
 * A square AVATAR_THUMB_SIZE WebP, centre-cropped — the same crop the
 * circles' CSS `object-fit: cover` applies to the full avatar.
 * @param {Buffer} buffer the stored (already EXIF-rotated) avatar
 * @returns {Promise<Buffer>}
 */
export async function makeAvatarThumb(buffer) {
  return sharp(buffer)
    .resize(AVATAR_THUMB_SIZE, AVATAR_THUMB_SIZE, { fit: 'cover' })
    .webp({ quality: 80 })
    .toBuffer()
}
