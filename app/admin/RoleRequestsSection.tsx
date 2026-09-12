'use client'

import { useState, useEffect } from 'react'
import { IconImage } from '@/components/IconImage'
import { isImageIcon } from '@/lib/icon-src'
import { LoadError } from './LoadError'

type RoleRequest = {
  clerk_user_id: string
  role_id: string
  role_name: string
  department_name: string | null
  department_icon: string | null
  applicant_name: string
  applicant_full_name: string
  requested_at: string
}

export function RoleRequestsSection() {
  const [requests, setRequests] = useState<RoleRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [deciding, setDeciding] = useState<string | null>(null)
  const [loadError, setLoadError] = useState(false)

  const load = () => {
    setLoadError(false)
    fetch('/api/admin/role-requests')
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then(d => setRequests(d.requests ?? []))
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  async function handleDecision(userId: string, decision: 'approved' | 'rejected') {
    setDeciding(userId)
    const res = await fetch(`/api/admin/role-requests/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision }),
    })
    if (res.ok) {
      setRequests(prev => prev.filter(r => r.clerk_user_id !== userId))
    }
    setDeciding(null)
  }

  if (loading) return <p style={{ opacity: 0.4, fontSize: '0.85rem' }}>Loading…</p>
  if (loadError) return <LoadError onRetry={() => { setLoading(true); load() }} />

  if (requests.length === 0) {
    return <p style={{ opacity: 0.4, fontSize: '0.85rem', fontStyle: 'italic' }}>No pending role requests.</p>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {requests.map(req => (
        <div key={req.clerk_user_id} style={{
          display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap',
          padding: '1rem 1.25rem',
          border: '1px solid rgb(var(--purple-rgb) / 0.2)',
          borderRadius: '0.75rem',
          background: 'rgb(var(--purple-rgb) / 0.03)',
        }}>
          {/* Camper info */}
          <div style={{ flex: 1, minWidth: '160px' }}>
            <p style={{ fontSize: '0.9rem', color: 'var(--cream)', margin: 0 }}>{req.applicant_name}</p>
            {req.applicant_full_name !== req.applicant_name && (
              <p style={{ fontSize: '0.75rem', opacity: 0.45, margin: '0.15rem 0 0' }}>{req.applicant_full_name}</p>
            )}
          </div>

          {/* Role */}
          <div style={{ flex: 1, minWidth: '140px' }}>
            {req.department_name && (
              <p style={{ fontSize: '0.68rem', color: 'var(--gold)', opacity: 0.55, margin: '0 0 0.15rem', letterSpacing: '0.04em', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                {req.department_icon && (
                  isImageIcon(req.department_icon)
                    ? <IconImage src={req.department_icon} size="0.8rem" fill={0.92} />
                    : <span>{req.department_icon}</span>
                )}
                {req.department_name}
              </p>
            )}
            <p style={{ fontSize: '0.88rem', color: 'var(--purple)', margin: 0 }}>{req.role_name}</p>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
            <button
              onClick={() => handleDecision(req.clerk_user_id, 'approved')}
              disabled={deciding === req.clerk_user_id}
              style={{
                padding: '0.4rem 1rem', borderRadius: '9999px',
                border: '1px solid rgba(100,200,120,0.4)',
                background: 'rgba(100,200,120,0.08)',
                color: 'var(--success)', cursor: 'pointer', fontSize: '0.8rem',
                opacity: deciding === req.clerk_user_id ? 0.5 : 1,
              }}
            >
              Approve
            </button>
            <button
              onClick={() => handleDecision(req.clerk_user_id, 'rejected')}
              disabled={deciding === req.clerk_user_id}
              style={{
                padding: '0.4rem 1rem', borderRadius: '9999px',
                border: '1px solid rgba(255,80,80,0.25)',
                background: 'transparent',
                color: 'var(--danger)', cursor: 'pointer', fontSize: '0.8rem',
                opacity: deciding === req.clerk_user_id ? 0.5 : 1,
              }}
            >
              Reject
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
