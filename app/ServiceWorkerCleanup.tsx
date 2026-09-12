'use client'

import { useEffect } from 'react'

// The PWA (manifest + /sw.js + install prompt) was removed 2026-09-12 — the
// mobile app ships as a real store app instead. Browsers that registered the
// old worker would otherwise keep it (and its /_next/static cache) until the
// update check 404s; this unregisters it and clears the caches on the next
// visit so nobody keeps running stale bundles. Renders nothing. Safe to delete
// once every member has loaded the site again after the removal.
export default function ServiceWorkerCleanup() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return
    navigator.serviceWorker.getRegistrations()
      .then(rs => rs.forEach(r => r.unregister()))
      .catch(() => {})
    if ('caches' in window) {
      caches.keys().then(keys => keys.forEach(k => caches.delete(k))).catch(() => {})
    }
  }, [])

  return null
}
