import crypto from 'crypto'

// Per-request Postgres identity for the scoped client (docs/tenancy-design.md
// §8 row 1e). tenantDb(communityId) sends a short-lived JWT as the
// `authenticated` role carrying `community_id`; the RLS policies from migration
// 076 admit only that community's rows.
//
// Signing material — SUPABASE_JWT_SECRET:
//   • the project's JWT secret (Dashboard → Settings → API → JWT Settings) → HS256
//   • or a PEM private key (a signing key you imported under JWT Signing Keys)
//     → RS256 / ES256, with its key id in SUPABASE_JWT_KID.
// Unset → tenantDb falls back to the service-role client (RLS bypassed, the
// pre-1e behaviour) and warns once.

const TOKEN_TTL_S = 60 * 60

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url')
}

type Signer = { alg: 'HS256' | 'RS256' | 'ES256'; sign: (data: string) => string; kid?: string }

let cachedSigner: Signer | null | undefined

function signer(): Signer | null {
  if (cachedSigner !== undefined) return cachedSigner
  const secret = process.env.SUPABASE_JWT_SECRET?.trim()
  if (!secret) return (cachedSigner = null)
  if (secret.includes('-----BEGIN')) {
    const key = crypto.createPrivateKey(secret)
    const kid = process.env.SUPABASE_JWT_KID?.trim()
    if (key.asymmetricKeyType === 'ec') {
      cachedSigner = { alg: 'ES256', kid, sign: d => b64url(crypto.sign('sha256', Buffer.from(d), { key, dsaEncoding: 'ieee-p1363' })) }
    } else {
      cachedSigner = { alg: 'RS256', kid, sign: d => b64url(crypto.sign('sha256', Buffer.from(d), key)) }
    }
  } else {
    cachedSigner = { alg: 'HS256', sign: d => b64url(crypto.createHmac('sha256', secret).update(d).digest()) }
  }
  return cachedSigner
}

export function isTenantTokenConfigured(): boolean {
  return signer() !== null
}

/** A signed `authenticated` JWT scoped to one community; null when unconfigured. */
export function mintTenantToken(communityId: string, now: Date = new Date()): { token: string; expiresAt: number } | null {
  const s = signer()
  if (!s) return null
  const iat = Math.floor(now.getTime() / 1000)
  const exp = iat + TOKEN_TTL_S
  const header = { alg: s.alg, typ: 'JWT', ...(s.kid ? { kid: s.kid } : {}) }
  const claims = {
    role: 'authenticated',
    aud: 'authenticated',
    iss: 'many-hands',
    sub: `community:${communityId}`,
    community_id: communityId,
    iat,
    exp,
  }
  const data = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`
  return { token: `${data}.${s.sign(data)}`, expiresAt: exp * 1000 }
}
