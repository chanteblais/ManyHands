import type { Metadata, Viewport } from 'next'
import { Libre_Baskerville, Cormorant_Garamond } from 'next/font/google'
import { ClerkProvider } from '@clerk/nextjs'
import { headers } from 'next/headers'
import { clerkFallbackHome, resolveSiteOrigin } from '@/lib/site-origin'
import { getCommunity, toPublicCommunity } from '@/lib/community'
import { CommunityProvider } from '@/components/CommunityProvider'
import { themeOverrideCss, THEME_COLORS } from '@/lib/theme'
import ServiceWorkerRegister from './ServiceWorkerRegister'
import InstallPrompt from './InstallPrompt'
import './globals.css'

const libreBaskerville = Libre_Baskerville({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-libre-baskerville',
})

const cormorantGaramond = Cormorant_Garamond({
  subsets: ['latin'],
  // 300 was loaded but never used; check inline fontWeight uses before
  // trimming further (500 IS used — ApprovedCamperPill, RadioHero, profile).
  weight: ['400', '500', '600', '700'],
  variable: '--font-cormorant-garamond',
})

export async function generateMetadata(): Promise<Metadata> {
  const { name, eventName, description } = await getCommunity()
  return {
    title: eventName ? `${name} @ ${eventName}` : name,
    description: description ?? `${name} community`,
    icons: {
      icon: [
        { url: '/favicon/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
        { url: '/favicon/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      ],
      shortcut: ['/favicon/favicon.ico'],
      apple: '/favicon/apple-touch-icon.png',
    },
    // Manifest is generated dynamically by app/manifest.ts (auto-linked by Next).
    appleWebApp: {
      capable: true,
      title: name,
      statusBarStyle: 'black',
    },
  }
}

export const viewport: Viewport = {
  // Browser chrome colour = the default ink token. Meta tags can't resolve
  // CSS variables, and a per-community value here would need an async
  // generateViewport(), which changes how Next streams the <head> — logged in
  // the generalizability log as a later item.
  themeColor: THEME_COLORS.ink.hex,
  width: 'device-width',
  initialScale: 1,
}

// Clerk's frontend-API host, decoded from the publishable key
// (pk_<env>_<base64 "host$">) — no hardcoded domain, works per-community.
function clerkFrontendOriginFromKey(): string | null {
  const pk = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
  const b64 = pk?.split('_')[2]
  if (!b64) return null
  try {
    const host = Buffer.from(b64, 'base64').toString('utf8').replace(/\$$/, '')
    return host ? `https://${host}` : null
  } catch {
    return null
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const headerList = await headers()
  const appHome = clerkFallbackHome(resolveSiteOrigin(headerList))
  // Tenant resolution happens once per request, here; pages and routes call
  // getCommunity() themselves (cached) and pass community.id into tenantDb().
  const community = toPublicCommunity(await getCommunity())
  // A community's theme re-skins the site by overriding the :root tokens
  // declared in globals.css (lib/theme.ts); null when it sets none.
  const themeCss = themeOverrideCss(community.theme)
  const clerkFrontendOrigin = clerkFrontendOriginFromKey()

  return (
    <ClerkProvider
      afterSignOutUrl={appHome}
      signInFallbackRedirectUrl={appHome}
      signInUrl="/sign-in"
      telemetry={{ disabled: true }}
    >
      <html lang="en">
        <head>
          {/* Avatars and group icons load from Supabase Storage — warm up the
              connection so the first image skips DNS + TLS (~100-300ms). */}
          {process.env.NEXT_PUBLIC_SUPABASE_URL && (
            <link rel="preconnect" href={process.env.NEXT_PUBLIC_SUPABASE_URL} />
          )}
          {/* clerk-js loads at runtime from the frontend-API host (encoded in
              the publishable key) — the earliest, most blocking third-party
              connection, so warm it too. */}
          {clerkFrontendOrigin && <link rel="preconnect" href={clerkFrontendOrigin} crossOrigin="anonymous" />}
          {/* The TokyoDreams faces live in the render-blocking stylesheet, so
              without a preload the browser discovers the LCP heading's font
              only after CSS parse (guaranteed FOUT). Both faces total ~47KB. */}
          <link rel="preload" href="/fonts/TokyoDreams.v1.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
          <link rel="preload" href="/fonts/TokyoDreamsPlain.v1.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
          {themeCss && <style id="community-theme" dangerouslySetInnerHTML={{ __html: themeCss }} />}
        </head>
        <body
          className={`${libreBaskerville.variable} ${cormorantGaramond.variable}`}
          style={{ fontFamily: 'var(--font-libre-baskerville), Georgia, serif' }}
        >
          <CommunityProvider community={community}>
            <div className="site-shell">{children}</div>
            {/* Inside the provider: InstallPrompt reads useCommunity() for the name. */}
            <InstallPrompt />
          </CommunityProvider>
          <ServiceWorkerRegister />
        </body>
      </html>
    </ClerkProvider>
  )
}
