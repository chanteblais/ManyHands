'use client'

import { useState } from 'react'
import { IconImage } from '@/components/IconImage'
import { isImageIcon } from '@/lib/icon-src'
import { useConfirm } from '../components/ConfirmDialog'

export type MemberShift = { id: string; title: string; time: string | null; day: string; lead: boolean }

type Props = {
  clerkUserId: string
  role: { name: string; department: string | null; department_icon: string | null; commitment: string | null; approval_status: string | null } | null
  shifts: MemberShift[]
}

export function MemberSignupCard({ clerkUserId, role, shifts }: Props) {
  const [currentRole, setCurrentRole] = useState(role)
  const [currentShifts, setCurrentShifts] = useState(shifts)
  const [clearing, setClearing] = useState<string | null>(null) // 'role' | shift event id
  const [approving, setApproving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { confirm, confirmDialog } = useConfirm()

  async function handleApprove() {
    setApproving(true)
    setError(null)
    const res = await fetch(`/api/admin/role-requests/${clerkUserId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision: 'approved' }),
    })
    if (!res.ok) {
      const d = await res.json()
      setError(d.error ?? 'Something went wrong')
    } else {
      setCurrentRole(prev => prev ? { ...prev, approval_status: 'approved' } : prev)
    }
    setApproving(false)
  }

  async function handleClearRole() {
    const ok = await confirm({
      title: `Remove this member's role${currentRole ? ` (“${currentRole.name}”)` : ''}?`,
      body: 'They will be notified to choose a new one.',
      confirmLabel: 'Remove role',
      danger: true,
    })
    if (!ok) return
    setClearing('role')
    setError(null)
    const res = await fetch(`/api/admin/signups/${clerkUserId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clear_role: true }),
    })
    if (!res.ok) {
      const d = await res.json()
      setError(d.error ?? 'Something went wrong')
    } else {
      setCurrentRole(null)
    }
    setClearing(null)
  }

  async function handleToggleLead(s: MemberShift) {
    setClearing(s.id)
    setError(null)
    const res = await fetch(`/api/admin/signups/${clerkUserId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ set_shift_role: { schedule_event_id: s.id, role: s.lead ? 'member' : 'lead' } }),
    })
    if (!res.ok) {
      const d = await res.json()
      setError(d.error ?? 'Something went wrong')
    } else {
      setCurrentShifts(prev => prev.map(x => x.id === s.id ? { ...x, lead: !s.lead } : x))
    }
    setClearing(null)
  }

  async function handleRemoveShift(eventId: string) {
    const shift = currentShifts.find(s => s.id === eventId)
    const ok = await confirm({
      title: `Remove ${shift ? `“${shift.title}”` : 'this shift'} from the member?`,
      body: 'They can pick a replacement on their signup page.',
      confirmLabel: 'Remove shift',
      danger: true,
    })
    if (!ok) return
    setClearing(eventId)
    setError(null)
    const res = await fetch(`/api/admin/signups/${clerkUserId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ remove_shift: eventId }),
    })
    if (!res.ok) {
      const d = await res.json()
      setError(d.error ?? 'Something went wrong')
    } else {
      setCurrentShifts(prev => prev.filter(s => s.id !== eventId))
    }
    setClearing(null)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {/* Role card */}
      <div style={{
        padding: '1rem 1.25rem',
        border: '1px solid rgb(var(--gold-rgb) / 0.15)',
        borderRadius: '0.75rem',
        background: 'rgba(255,255,255,0.02)',
        display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap',
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: '0.65rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--gold)', opacity: 0.5, margin: '0 0 0.3rem' }}>Role</p>
          {currentRole ? (
            <>
              {currentRole.department && (
                <p style={{ fontSize: '0.72rem', color: 'var(--gold)', opacity: 0.5, margin: '0 0 0.15rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                  {currentRole.department_icon && (
                    isImageIcon(currentRole.department_icon)
                      ? <IconImage src={currentRole.department_icon} size="0.85rem" fill={0.92} />
                      : <span>{currentRole.department_icon}</span>
                  )}
                  {currentRole.department}
                </p>
              )}
              <p style={{ fontSize: '0.92rem', color: 'var(--cream)', margin: 0 }}>{currentRole.name}</p>
              {currentRole.commitment && (
                <p style={{ fontSize: '0.72rem', color: 'var(--gold)', opacity: 0.45, margin: '0.2rem 0 0' }}>{currentRole.commitment}</p>
              )}
              {currentRole.approval_status === 'pending' && (
                <span style={{ display: 'inline-block', marginTop: '0.3rem', fontSize: '0.65rem', color: 'var(--purple)', border: '1px solid rgb(var(--purple-rgb) / 0.3)', borderRadius: '9999px', padding: '0.1rem 0.4rem' }}>
                  pending approval
                </span>
              )}
            </>
          ) : (
            <p style={{ fontSize: '0.85rem', opacity: 0.35, fontStyle: 'italic', margin: 0 }}>Not assigned</p>
          )}
        </div>
        {currentRole && (
          <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
            {currentRole.approval_status === 'pending' && (
              <button
                onClick={handleApprove}
                disabled={approving}
                style={{
                  background: 'rgba(100,200,120,0.08)', border: '1px solid rgba(100,200,120,0.35)', borderRadius: '9999px',
                  color: 'var(--success)', cursor: 'pointer', padding: '0.35rem 0.85rem',
                  fontSize: '0.75rem', opacity: approving ? 0.4 : 1,
                }}
              >
                {approving ? 'Approving…' : 'Approve role'}
              </button>
            )}
            <button
              onClick={handleClearRole}
              disabled={clearing === 'role'}
              style={{
                background: 'none', border: '1px solid rgba(255,80,80,0.25)', borderRadius: '9999px',
                color: 'var(--danger)', cursor: 'pointer', padding: '0.35rem 0.85rem',
                fontSize: '0.75rem', opacity: clearing === 'role' ? 0.4 : 0.75,
              }}
            >
              {clearing === 'role' ? 'Removing…' : 'Remove role'}
            </button>
          </div>
        )}
      </div>

      {/* Shifts card — every shift the member holds */}
      <div style={{
        padding: '1rem 1.25rem',
        border: '1px solid rgb(var(--purple-rgb) / 0.15)',
        borderRadius: '0.75rem',
        background: 'rgb(var(--purple-rgb) / 0.02)',
      }}>
        <p style={{ fontSize: '0.65rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--purple)', opacity: 0.5, margin: '0 0 0.3rem' }}>
          Shifts{currentShifts.length > 0 ? ` — ${currentShifts.length}` : ''}
        </p>
        {currentShifts.length === 0 ? (
          <p style={{ fontSize: '0.85rem', opacity: 0.35, fontStyle: 'italic', margin: 0 }}>None</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {currentShifts.map(s => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: '0.9rem', color: 'var(--cream)', margin: 0 }}>
                    {s.title}
                    {s.lead && (
                      <span style={{
                        marginLeft: '0.45rem', fontSize: '0.6rem', letterSpacing: '0.08em',
                        textTransform: 'uppercase', color: 'var(--gold)',
                        border: '1px solid rgb(var(--gold-rgb) / 0.4)', borderRadius: '9999px',
                        padding: '0.08rem 0.45rem', verticalAlign: 'middle',
                      }}>
                        ✦ Lead
                      </span>
                    )}
                  </p>
                  <p style={{ fontSize: '0.72rem', color: 'var(--purple)', opacity: 0.45, margin: '0.15rem 0 0' }}>
                    {s.day}{s.time ? ` · ${s.time}` : ''}
                  </p>
                </div>
                <button
                  onClick={() => handleToggleLead(s)}
                  disabled={clearing === s.id}
                  style={{
                    background: 'none', border: '1px solid rgb(var(--gold-rgb) / 0.3)', borderRadius: '9999px',
                    color: 'var(--gold)', cursor: 'pointer', padding: '0.25rem 0.7rem',
                    fontSize: '0.7rem', flexShrink: 0,
                    opacity: clearing === s.id ? 0.4 : 0.75,
                  }}
                >
                  {s.lead ? 'Demote to member' : 'Make lead'}
                </button>
                <button
                  onClick={() => handleRemoveShift(s.id)}
                  disabled={clearing === s.id}
                  style={{
                    background: 'none', border: '1px solid rgba(255,80,80,0.25)', borderRadius: '9999px',
                    color: 'var(--danger)', cursor: 'pointer', padding: '0.25rem 0.7rem',
                    fontSize: '0.7rem', flexShrink: 0,
                    opacity: clearing === s.id ? 0.4 : 0.75,
                  }}
                >
                  {clearing === s.id ? '…' : 'Remove'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {error && <p style={{ color: 'var(--danger)', fontSize: '0.8rem' }}>{error}</p>}
      {confirmDialog}
    </div>
  )
}
