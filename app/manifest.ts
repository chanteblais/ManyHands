import type { MetadataRoute } from 'next'
import { getCommunity } from '@/lib/community'

// Web App Manifest — generated dynamically so each community deployment gets its
// own name/colours from its `communities` row. Next.js serves this at
// /manifest.webmanifest and injects the <link rel="manifest"> automatically.
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const { name, eventName, description } = await getCommunity()
  return {
    name: eventName ? `${name} @ ${eventName}` : name,
    short_name: name,
    description: description ?? `${name} community`,
    id: '/',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    // Ink background so the launch splash + status bar match the dark UI
    // instead of flashing white.
    background_color: '#1A0A24',
    theme_color: '#1A0A24',
    icons: [
      {
        src: '/favicon/android-chrome-192x192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/favicon/android-chrome-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/favicon/maskable-192x192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/favicon/maskable-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
