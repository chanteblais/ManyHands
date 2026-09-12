import crypto from 'crypto'
import { globalDb } from '@/lib/tenant-db'

// Native push channel: FCM HTTP v1 (delivers to both APNs/iOS and Android —
// the Capacitor app registers FCM tokens via /api/push/register). Implemented
// with bare fetch + a service-account JWT so we don't carry the firebase-admin
// dependency for one endpoint.
//
// Configuration: FIREBASE_SERVICE_ACCOUNT env var = the service account's JSON
// key (project_id, client_email, private_key). Until it's set, every send is a
// silent no-op — the notification seam (lib/notify.ts) works today with email
// only and picks up push the moment the app + Firebase project exist.

type ServiceAccount = { project_id: string; client_email: string; private_key: string }

function serviceAccount(): ServiceAccount | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (parsed.project_id && parsed.client_email && parsed.private_key) return parsed
  } catch {
    console.error('[push] FIREBASE_SERVICE_ACCOUNT is set but not valid JSON')
  }
  return null
}

export function isPushConfigured(): boolean {
  return serviceAccount() !== null
}

// --- OAuth2 access token (RS256 service-account JWT), cached until expiry ---

let cachedToken: { token: string; expiresAt: number } | null = null

async function accessToken(sa: ServiceAccount): Promise<string | null> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.token

  const now = Math.floor(Date.now() / 1000)
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url')
  const claims = Buffer.from(
    JSON.stringify({
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    })
  ).toString('base64url')
  const signature = crypto
    .createSign('RSA-SHA256')
    .update(`${header}.${claims}`)
    .sign(sa.private_key, 'base64url')

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${header}.${claims}.${signature}`,
    }),
  })
  if (!res.ok) {
    console.error('[push] token exchange failed:', res.status, await res.text().catch(() => ''))
    return null
  }
  const data = (await res.json()) as { access_token: string; expires_in: number }
  // Refresh 5 minutes early.
  cachedToken = { token: data.access_token, expiresAt: Date.now() + (data.expires_in - 300) * 1000 }
  return data.access_token
}

// --- Sending ---

export type PushPayload = {
  title: string
  body: string
  /** Internal path the tap should open (e.g. '/messages?to=…'). */
  link: string
}

/**
 * Send a push notification to every device a member has registered.
 * Never throws; returns how many devices were reached. A silent no-op when
 * FCM isn't configured or the member has no tokens (email remains the only
 * channel for them — the seam treats that as normal, not an error).
 */
export async function sendPushToMember(clerkUserId: string, payload: PushPayload): Promise<{ sent: number }> {
  try {
    const sa = serviceAccount()
    if (!sa) return { sent: 0 }

    const { data: tokens } = await globalDb()
      .from('push_tokens')
      .select('token')
      .eq('clerk_user_id', clerkUserId)
    if (!tokens?.length) return { sent: 0 }

    const bearer = await accessToken(sa)
    if (!bearer) return { sent: 0 }

    const results = await Promise.all(
      tokens.map(async ({ token }) => {
        const res = await fetch(
          `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`,
          {
            method: 'POST',
            headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              message: {
                token,
                notification: { title: payload.title, body: payload.body },
                data: { link: payload.link },
                apns: { payload: { aps: { sound: 'default' } } },
              },
            }),
          }
        )
        if (res.ok) return true
        const text = await res.text().catch(() => '')
        // Token no longer valid (app uninstalled / token rotated) — prune it.
        if (res.status === 404 || text.includes('UNREGISTERED') || text.includes('INVALID_ARGUMENT')) {
          await globalDb().from('push_tokens').delete().eq('token', token)
        } else {
          console.error('[push] FCM send failed:', res.status, text)
        }
        return false
      })
    )
    return { sent: results.filter(Boolean).length }
  } catch (err) {
    console.error('[push] send failed:', err)
    return { sent: 0 }
  }
}
