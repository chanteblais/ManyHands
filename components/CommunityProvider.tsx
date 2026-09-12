'use client'

import { createContext, useContext } from 'react'
import type { PublicCommunity } from '@/lib/community'

// Client-side access to the current community (id, slug, name, event name,
// theme). Mounted once in app/layout.tsx from the server-resolved community
// (lib/community.ts). Client components read it with `useCommunity()` instead
// of importing build-time constants from lib/site-config.ts.

const CommunityContext = createContext<PublicCommunity | null>(null)

export function CommunityProvider({
  community,
  children,
}: {
  community: PublicCommunity
  children: React.ReactNode
}) {
  return <CommunityContext.Provider value={community}>{children}</CommunityContext.Provider>
}

export function useCommunity(): PublicCommunity {
  const value = useContext(CommunityContext)
  if (!value) throw new Error('useCommunity() must be used inside <CommunityProvider> (mounted in app/layout.tsx)')
  return value
}
