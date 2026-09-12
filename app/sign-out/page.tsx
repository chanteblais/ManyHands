'use client'

import { useEffect } from 'react'
import { useClerk } from '@clerk/nextjs'

export default function SignOutPage() {
  const { signOut } = useClerk()

  useEffect(() => {
    signOut()
  }, [])

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'var(--cream)',
      opacity: 0.4,
      fontSize: '0.85rem',
      letterSpacing: '0.1em',
    }}>
      Signing out…
    </div>
  )
}
