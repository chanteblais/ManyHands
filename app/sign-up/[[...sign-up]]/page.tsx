import { SignUp } from '@clerk/nextjs'
import { auth } from '@clerk/nextjs/server'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { clerkAppearance } from '@/lib/clerk-appearance'
import { resolveSiteOrigin } from '@/lib/site-origin'
import { isKnownOrigin } from '@/lib/community'

export default async function SignUpPage(props: { searchParams: Promise<{ redirect_url?: string }> }) {
  const searchParams = await props.searchParams
  const baseUrl = resolveSiteOrigin(await headers())

  // Where to land after sign-up: /apply on this origin, or — for a satellite
  // host's sign-up that bounced here — /apply on that known community host.
  let after = `${baseUrl}/apply`
  const returnTo = searchParams.redirect_url
  if (returnTo?.startsWith('/')) {
    after = `${baseUrl}${returnTo}`
  } else if (returnTo) {
    try {
      const parsed = new URL(returnTo)
      if (parsed.origin === baseUrl || (await isKnownOrigin(parsed.origin))) after = `${parsed.origin}/apply`
    } catch { /* keep fallback */ }
  }

  const { userId } = await auth()
  if (userId) redirect(after)

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4rem 1rem' }}>
      <SignUp
        routing="path"
        path="/sign-up"
        forceRedirectUrl={after}
        fallbackRedirectUrl={after}
        signInUrl="/sign-in"
        appearance={clerkAppearance}
      />
    </div>
  )
}
