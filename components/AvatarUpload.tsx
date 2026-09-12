'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseResizedUrl } from '@/lib/supabase-image'

export function AvatarUpload({
  initialUrl,
  displayName,
  size = 260,
}: {
  initialUrl: string | null
  displayName: string
  size?: number
}) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(initialUrl)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const initials = displayName
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  // Upload via XHR so we can report real upload progress to the user.
  const uploadAvatar = (file: File): Promise<{ ok: boolean; data: { avatarUrl?: string; error?: string } }> => {
    return new Promise((resolve) => {
      const formData = new FormData()
      formData.append('avatar', file)

      const xhr = new XMLHttpRequest()
      xhr.open('POST', '/api/profile/avatar')

      xhr.upload.onprogress = (ev) => {
        if (ev.lengthComputable) {
          setProgress(Math.round((ev.loaded / ev.total) * 100))
        }
      }

      xhr.onload = () => {
        let data: { avatarUrl?: string; error?: string } = {}
        try {
          data = JSON.parse(xhr.responseText)
        } catch {
          data = { error: 'Upload failed' }
        }
        resolve({ ok: xhr.status >= 200 && xhr.status < 300, data })
      }

      xhr.onerror = () => resolve({ ok: false, data: { error: 'Upload failed' } })

      xhr.send(formData)
    })
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Local preview immediately
    const objectUrl = URL.createObjectURL(file)
    setPreview(objectUrl)
    setError(null)
    setProgress(0)
    setUploading(true)

    try {
      const { ok, data } = await uploadAvatar(file)

      if (!ok) {
        setPreview(initialUrl) // revert on error
        setError(data.error ?? 'Upload failed')
        return
      }

      setProgress(100)
      setPreview(data.avatarUrl ?? null)
      router.refresh()
      // Signal the header to re-fetch nav-auth so the avatar circle updates immediately
      window.dispatchEvent(new CustomEvent('glaum:avatar-updated', { detail: { avatarUrl: data.avatarUrl } }))
    } finally {
      setUploading(false)
      setProgress(0)
      // Reset input so the same file can be re-selected
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
      <button
        id="avatar-upload"
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        aria-label="Change profile picture"
        aria-busy={uploading}
        style={{
          position: 'relative',
          width: `${size}px`,
          height: `${size}px`,
          borderRadius: '50%',
          border: '3px solid var(--bronze)',
          boxShadow: '0 0 0 1px rgba(60,35,10,0.6), 0 0 20px rgba(111,73,31,0.25), 0 8px 32px rgba(0,0,0,0.55)',
          background: 'rgb(var(--gold-rgb) / 0.08)',
          cursor: uploading ? 'wait' : 'pointer',
          overflow: 'hidden',
          padding: 0,
          flexShrink: 0,
        }}
      >
        {/* Avatar image or initials */}
        {preview ? (
          <img
            src={supabaseResizedUrl(preview, size * 2) ?? preview}
            alt={displayName}
            fetchPriority="high"
            style={{ width: '100%', minHeight: '100%', objectFit: 'cover', display: 'block' }}
          />
        ) : (
          <span style={{
            fontFamily: 'var(--font-display)',
            fontSize: '1.6rem',
            color: 'var(--gold)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            height: '100%',
          }}>
            {initials}
          </span>
        )}

        {/* Hover / uploading overlay */}
        <span
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.4rem',
            background: 'rgba(10,4,20,0.6)',
            opacity: uploading ? 1 : 0,
            transition: 'opacity 0.2s',
            fontSize: '0.6rem',
            letterSpacing: '0.1em',
            color: 'var(--cream)',
          }}
          className="avatar-overlay"
        >
          {uploading ? (
            <>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.7, animation: 'spin 1s linear infinite' }}>
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
              <span>Uploading {progress}%</span>
              {/* Progress bar */}
              <span
                style={{
                  width: '120px',
                  height: '5px',
                  borderRadius: '9999px',
                  background: 'rgb(var(--cream-rgb) / 0.18)',
                  overflow: 'hidden',
                  marginTop: '0.1rem',
                }}
              >
                <span
                  style={{
                    display: 'block',
                    height: '100%',
                    width: `${progress}%`,
                    background: 'linear-gradient(90deg, var(--gold), var(--purple))',
                    borderRadius: '9999px',
                    transition: 'width 0.2s ease',
                  }}
                />
              </span>
            </>
          ) : (
            <>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.8 }}>
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
              <span>Change</span>
            </>
          )}
        </span>
      </button>

      {error && (
        <p style={{ fontSize: '0.72rem', color: 'var(--danger)', textAlign: 'center', maxWidth: '160px' }}>{error}</p>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />

      <style dangerouslySetInnerHTML={{ __html: `
        button:hover .avatar-overlay { opacity: 1 !important; }
        @keyframes spin { to { transform: rotate(360deg); } }
      ` }} />
    </div>
  )
}
