'use client'

import { AdminActions } from './AdminActions'

// `kindTag` marks the row as a member application — set in the Pending Review
// queue, where member applications and volunteer signups share one list and
// every row wears its kind (directory tag language).
export function ApplicationRow({ app, showActions, kindTag = false }: { app: any; showActions: boolean; kindTag?: boolean }) {
  const submitted = new Date(app.submitted_at).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
      <a
        href={`/admin/${app.id}`}
        style={{
          flex: 1,
          minWidth: '200px',
          padding: '1.25rem 1.5rem',
          border: '1px solid rgb(var(--gold-rgb) / 0.12)',
          borderRadius: '0.75rem',
          background: 'rgba(255,255,255,0.02)',
          display: 'flex',
          alignItems: 'center',
          gap: '1.5rem',
          flexWrap: 'wrap',
          textDecoration: 'none',
          color: 'inherit',
          transition: 'border-color 0.15s, background 0.15s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = 'rgb(var(--gold-rgb) / 0.3)'
          e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = 'rgb(var(--gold-rgb) / 0.12)'
          e.currentTarget.style.background = 'rgba(255,255,255,0.02)'
        }}
      >
        <div style={{ flex: 1, minWidth: '160px' }}>
          <p style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: '0.2rem' }}>
            {app.first_name} {app.last_name}
          </p>
          <p style={{ fontSize: '0.8rem', opacity: 0.5 }}>{app.email}</p>
        </div>
        {kindTag && (
          <span style={{ fontSize: '0.62rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--gold)', border: '1px solid rgb(var(--gold-rgb) / 0.35)', background: 'rgb(var(--gold-rgb) / 0.07)', borderRadius: '9999px', padding: '0.18rem 0.6rem', flexShrink: 0 }}>
            Member
          </span>
        )}
        <div style={{ fontSize: '0.8rem', opacity: 0.5, flexShrink: 0 }}>
          {submitted}
        </div>
        <div style={{ fontSize: '0.75rem', opacity: 0.6, flexShrink: 0 }}>
          {app.attendance}
        </div>
        <div style={{ fontSize: '0.7rem', opacity: 0.35, flexShrink: 0, letterSpacing: '0.05em' }}>
          View →
        </div>
      </a>
      {showActions && (
        <AdminActions id={app.id} email={app.email} />
      )}
    </div>
  )
}
