'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { DEFAULT_DUES_CONFIG, formatDuesAmount, type DuesConfig, type DuesMode } from '@/lib/dues'
import type { DuesRosterRow } from '@/lib/dues-roster'

const GOLD = 'var(--gold)'
const PURPLE = 'var(--purple)'
const CREAM = 'var(--cream)'

const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  background: 'rgba(255,255,255,0.04)', border: '1px solid rgb(var(--gold-rgb) / 0.2)',
  borderRadius: '0.4rem', color: CREAM, fontSize: '0.85rem',
  padding: '0.45rem 0.6rem', outline: 'none', fontFamily: 'inherit',
}
const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '0.68rem', letterSpacing: '0.1em',
  textTransform: 'uppercase', opacity: 0.5, marginBottom: '0.35rem',
}

export function DuesManager({
  initialConfig,
  initialRoster,
}: {
  initialConfig: DuesConfig
  initialRoster: DuesRosterRow[]
}) {
  const router = useRouter()

  // ── Payment settings (config_dues) ───────────────────────────────
  const [config, setConfig] = useState<DuesConfig>(initialConfig ?? DEFAULT_DUES_CONFIG)
  const [savedCfg, setSavedCfg] = useState(false)
  const [cfgError, setCfgError] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const saveConfig = useCallback((next: DuesConfig) => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      try {
        const res = await fetch('/api/admin/page-content', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ config_dues: JSON.stringify(next) }),
        })
        if (!res.ok) {
          const d = await res.json().catch(() => ({}))
          setCfgError(d.error ?? 'Failed to save'); setSavedCfg(false)
        } else {
          setCfgError(null); setSavedCfg(true)
          setTimeout(() => setSavedCfg(false), 1800)
        }
      } catch {
        setCfgError('Network error'); setSavedCfg(false)
      }
    }, 600)
  }, [])

  function patchConfig(patch: Partial<DuesConfig>) {
    const next = { ...config, ...patch }
    setConfig(next)
    saveConfig(next)
  }

  // Enable + audience changes alter who's in the tracker, so save immediately
  // (a toggle is deliberate) and refresh so the server reloads the roster.
  async function patchConfigNow(patch: Partial<DuesConfig>) {
    const next = { ...config, ...patch }
    setConfig(next)
    if (timer.current) clearTimeout(timer.current)
    try {
      const res = await fetch('/api/admin/page-content', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config_dues: JSON.stringify(next) }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setCfgError(d.error ?? 'Failed to save'); return
      }
      setCfgError(null); setSavedCfg(true); setTimeout(() => setSavedCfg(false), 1800)
      router.refresh()
    } catch {
      setCfgError('Network error')
    }
  }

  const toggleAudience = (key: 'members' | 'volunteers') =>
    patchConfigNow({ audience: { ...config.audience, [key]: !config.audience[key] } })

  const amountPreview = formatDuesAmount(config)

  // ── Tracker (per-member paid state) ──────────────────────────────
  const [roster, setRoster] = useState<DuesRosterRow[]>(initialRoster)
  const [filter, setFilter] = useState<'all' | 'awaiting' | 'owed' | 'paid'>('all')
  const [noteDraft, setNoteDraft] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<Record<string, boolean>>({})
  const [rowError, setRowError] = useState<string | null>(null)

  // Row state: 'paid' (confirmed) | 'awaiting' (self-reported, unconfirmed) | 'owed'.
  const stateOf = (r: DuesRosterRow): 'paid' | 'awaiting' | 'owed' =>
    r.paidAt ? 'paid' : r.reportedAt ? 'awaiting' : 'owed'

  const active = roster.filter(r => !r.suspended)
  const paidCount = active.filter(r => stateOf(r) === 'paid').length
  const awaitingCount = active.filter(r => stateOf(r) === 'awaiting').length
  const owedCount = active.length - paidCount - awaitingCount

  const visible = useMemo(() => {
    const rows = roster.filter(r => {
      if (r.suspended) return filter === 'all'
      if (filter === 'awaiting') return stateOf(r) === 'awaiting'
      if (filter === 'owed') return stateOf(r) !== 'paid'
      if (filter === 'paid') return stateOf(r) === 'paid'
      return true
    })
    // Awaiting review first (needs your action), then owed, then paid, then
    // suspended — alphabetical within each.
    return [...rows].sort((a, b) => {
      const rank = (r: DuesRosterRow) => (r.suspended ? 3 : r.paidAt ? 2 : r.reportedAt ? 0 : 1)
      return rank(a) - rank(b) || a.name.localeCompare(b.name)
    })
  }, [roster, filter])

  async function setPaid(row: DuesRosterRow, paid: boolean) {
    setBusy(b => ({ ...b, [row.id]: true }))
    setRowError(null)
    try {
      const res = await fetch(`/api/admin/dues/${row.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paid, note: paid ? (noteDraft[row.id] ?? '').trim() : '', entity: row.kind }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setRowError(data.error ?? 'Failed to update'); return }
      setRoster(rs => rs.map(r => r.id === row.id
        ? {
            ...r,
            paidAt: data.dues_paid_at ?? null,
            // Resetting to unpaid also clears the member's self-report (API does too).
            reportedAt: paid ? r.reportedAt : null,
            note: paid ? ((noteDraft[row.id] ?? '').trim() || null) : null,
          }
        : r))
      if (!paid) setNoteDraft(d => ({ ...d, [row.id]: '' }))
    } catch {
      setRowError('Network error')
    } finally {
      setBusy(b => ({ ...b, [row.id]: false }))
    }
  }

  return (
    <div>
      <style dangerouslySetInnerHTML={{ __html: `
        .dues-row { display:flex; align-items:center; gap:0.75rem; flex-wrap:wrap; }
        .dues-row .grow { flex:1; min-width:160px; }
        .dues-pay-grid { display:grid; grid-template-columns:1fr 1fr; gap:0.9rem; }
        @media (max-width:560px){ .dues-pay-grid { grid-template-columns:1fr; } }
      ` }} />

      <p style={{ fontSize: '0.78rem', opacity: 0.5, lineHeight: 1.6, margin: '0 0 1.25rem' }}>
        Set how dues are collected and track who has paid. Dues are collected by email this year —
        mark each person paid as their payment arrives. To make dues part of a member&rsquo;s attunement
        checklist, add a <strong style={{ opacity: 0.8 }}>Camp dues paid</strong> task in
        Configure&nbsp;→&nbsp;Attunement Tasks.
      </p>

      {/* ── Settings: on/off + who owes ─────────────────── */}
      <div style={{ border: '1px solid rgb(var(--gold-rgb) / 0.15)', borderRadius: '0.75rem', background: 'rgb(var(--gold-rgb) / 0.02)', padding: '1.1rem 1.25rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
          <div>
            <span style={{ display: 'block', fontSize: '0.9rem', color: CREAM }}>Collect camp dues</span>
            <span style={{ display: 'block', fontSize: '0.72rem', opacity: 0.5, lineHeight: 1.5 }}>
              {config.enabled ? 'Dues are on.' : 'Dues are off — nothing shows for members, and any dues attunement task is hidden.'}
            </span>
          </div>
          <button
            onClick={() => patchConfigNow({ enabled: !config.enabled })}
            aria-pressed={config.enabled}
            title={config.enabled ? 'On' : 'Off'}
            style={{ width: '44px', height: '24px', borderRadius: '9999px', flexShrink: 0, border: 'none', cursor: 'pointer', background: config.enabled ? GOLD : 'rgba(255,255,255,0.12)', transition: 'background 0.2s', position: 'relative' }}
          >
            <div style={{ position: 'absolute', top: '3px', left: config.enabled ? '23px' : '3px', width: '18px', height: '18px', borderRadius: '50%', background: config.enabled ? 'var(--ink)' : 'rgba(255,255,255,0.5)', transition: 'left 0.2s' }} />
          </button>
        </div>

        {config.enabled && (
          <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid rgb(var(--gold-rgb) / 0.12)' }}>
            <span style={labelStyle}>Who owes dues</span>
            <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
              {([['members', 'Camp members'], ['volunteers', 'Volunteers']] as const).map(([key, label]) => {
                const on = config.audience[key]
                return (
                  <button
                    key={key}
                    onClick={() => toggleAudience(key)}
                    aria-pressed={on}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                      padding: '0.35rem 0.8rem', borderRadius: '9999px', cursor: 'pointer', fontFamily: 'inherit',
                      fontSize: '0.78rem', letterSpacing: '0.03em',
                      border: `1px solid ${on ? 'rgb(var(--gold-rgb) / 0.5)' : 'rgba(255,255,255,0.14)'}`,
                      background: on ? 'rgb(var(--gold-rgb) / 0.14)' : 'transparent',
                      color: on ? GOLD : CREAM, opacity: on ? 1 : 0.6,
                    }}
                  >
                    <span aria-hidden>{on ? '✓' : '＋'}</span>{label}
                  </button>
                )
              })}
            </div>
            <p style={{ fontSize: '0.68rem', opacity: 0.4, margin: '0.55rem 0 0', lineHeight: 1.5, fontStyle: 'italic' }}>
              Camp members get the full flow (self-report + attunement). Volunteers are tracked here only — they have no self-serve dues page.
            </p>
          </div>
        )}
      </div>

      {!config.enabled && (
        <p style={{ textAlign: 'center', opacity: 0.4, fontStyle: 'italic', fontSize: '0.82rem', padding: '0.5rem 0 0.25rem' }}>
          Turn dues on to set up payment and track who&rsquo;s paid.
        </p>
      )}

      {config.enabled && (<>

      {/* ── Payment settings ─────────────────────────────── */}
      <div style={{ border: '1px solid rgb(var(--gold-rgb) / 0.15)', borderRadius: '0.75rem', background: 'rgb(var(--gold-rgb) / 0.02)', padding: '1.1rem 1.25rem', marginBottom: '1.5rem' }}>
        <h4 style={{ fontSize: '0.72rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: GOLD, opacity: 0.75, margin: '0 0 1rem' }}>
          How members pay
        </h4>

        <div style={{ marginBottom: '1rem' }}>
          <label style={labelStyle}>Payment email <span style={{ textTransform: 'none', letterSpacing: 0, opacity: 0.7 }}>(e-transfer / PayPal)</span></label>
          <input
            value={config.paymentEmail}
            onChange={e => patchConfig({ paymentEmail: e.target.value })}
            placeholder="dues@yourcamp.org"
            style={inputStyle}
          />
        </div>

        {/* Fixed vs sliding scale */}
        <div style={{ marginBottom: '1rem' }}>
          <label style={labelStyle}>Amount</label>
          <div style={{ display: 'inline-flex', border: '1px solid rgb(var(--gold-rgb) / 0.25)', borderRadius: '0.5rem', overflow: 'hidden', marginBottom: '0.75rem' }}>
            {(['fixed', 'sliding'] as DuesMode[]).map(m => (
              <button
                key={m}
                onClick={() => patchConfig({ mode: m })}
                style={{
                  padding: '0.35rem 0.9rem', fontSize: '0.75rem', letterSpacing: '0.05em',
                  border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                  background: config.mode === m ? 'rgb(var(--gold-rgb) / 0.18)' : 'transparent',
                  color: config.mode === m ? GOLD : CREAM,
                  opacity: config.mode === m ? 1 : 0.6,
                }}
              >
                {m === 'fixed' ? 'Fixed' : 'Sliding scale'}
              </button>
            ))}
          </div>

          {config.mode === 'fixed' ? (
            <input
              value={config.amount}
              onChange={e => patchConfig({ amount: e.target.value })}
              placeholder="$50"
              style={{ ...inputStyle, maxWidth: '180px' }}
            />
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
              <input
                value={config.minAmount}
                onChange={e => patchConfig({ minAmount: e.target.value })}
                placeholder="$30"
                style={{ ...inputStyle, maxWidth: '130px' }}
              />
              <span style={{ opacity: 0.5 }}>to</span>
              <input
                value={config.maxAmount}
                onChange={e => patchConfig({ maxAmount: e.target.value })}
                placeholder="$75"
                style={{ ...inputStyle, maxWidth: '130px' }}
              />
            </div>
          )}
          {amountPreview && (
            <p style={{ fontSize: '0.72rem', opacity: 0.45, margin: '0.5rem 0 0' }}>
              Members will see: <span style={{ color: GOLD, opacity: 0.9 }}>{amountPreview}</span>
              {config.mode === 'sliding' ? ' (sliding scale)' : ''}
            </p>
          )}
        </div>

        <div>
          <label style={labelStyle}>Instructions <span style={{ textTransform: 'none', letterSpacing: 0, opacity: 0.7 }}>(shown on the member dues page)</span></label>
          <textarea
            value={config.instructions}
            onChange={e => patchConfig({ instructions: e.target.value })}
            placeholder="e.g. Send an e-transfer with your name in the message. Dues are due by July 15 — reach out if that's tricky."
            rows={3}
            style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }}
          />
          <p style={{ fontSize: '0.66rem', opacity: 0.35, margin: '0.35rem 0 0', fontStyle: 'italic' }}>
            Supports simple formatting: paragraphs, ✦ bullets, [links](url), **bold**.
          </p>
        </div>

        <div style={{ minHeight: '1.1rem', marginTop: '0.6rem' }}>
          {cfgError && <p style={{ fontSize: '0.75rem', color: 'var(--danger)', margin: 0 }}>{cfgError}</p>}
          {!cfgError && savedCfg && <p style={{ fontSize: '0.72rem', color: GOLD, opacity: 0.6, margin: 0 }}>Saved ✓</p>}
        </div>
      </div>

      {/* ── Tracker ───────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.9rem' }}>
        <h4 style={{ fontSize: '0.72rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: GOLD, opacity: 0.75, margin: 0 }}>
          Who has paid
        </h4>
        <span style={{ fontSize: '0.78rem', opacity: 0.6 }}>
          <span style={{ color: GOLD }}>{paidCount} paid</span>
          {awaitingCount > 0 && (
            <>
              <span style={{ opacity: 0.4 }}> · </span>
              <span style={{ color: PURPLE, opacity: 0.9 }}>{awaitingCount} to review</span>
            </>
          )}
          <span style={{ opacity: 0.4 }}> · </span>
          <span style={{ opacity: 0.55 }}>{owedCount} owed</span>
        </span>
      </div>

      <div style={{ display: 'inline-flex', border: '1px solid rgb(var(--gold-rgb) / 0.2)', borderRadius: '0.5rem', overflow: 'hidden', marginBottom: '0.9rem' }}>
        {(['all', 'awaiting', 'owed', 'paid'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: '0.3rem 0.8rem', fontSize: '0.72rem', letterSpacing: '0.05em',
              border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              background: filter === f ? 'rgb(var(--gold-rgb) / 0.15)' : 'transparent',
              color: filter === f ? GOLD : CREAM, opacity: filter === f ? 1 : 0.55,
            }}
          >
            {f === 'all' ? 'All members' : f === 'awaiting' ? `To review${awaitingCount ? ` (${awaitingCount})` : ''}` : f === 'owed' ? 'Owed' : `Paid${paidCount ? ` (${paidCount})` : ''}`}
          </button>
        ))}
      </div>

      {rowError && <p style={{ fontSize: '0.75rem', color: 'var(--danger)', margin: '0 0 0.6rem' }}>{rowError}</p>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        {visible.length === 0 && (
          <p style={{ textAlign: 'center', opacity: 0.4, fontStyle: 'italic', fontSize: '0.82rem', padding: '1rem 0' }}>
            {filter === 'awaiting'
              ? 'Nothing to review right now.'
              : filter === 'owed'
                ? 'Everyone has paid — nothing outstanding.'
                : filter === 'paid'
                  ? 'No one has paid yet.'
                  : 'No approved members yet.'}
          </p>
        )}

        {visible.map(row => {
          const state = stateOf(row)
          const loading = !!busy[row.id]
          const shortDate = (d: string) => new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
          return (
            <div
              key={row.id}
              className="dues-row"
              style={{
                border: `1px solid ${state === 'awaiting' ? 'rgb(var(--purple-rgb) / 0.3)' : 'rgb(var(--gold-rgb) / 0.12)'}`,
                borderRadius: '0.65rem',
                background: state === 'paid' ? 'rgb(var(--gold-rgb) / 0.04)' : state === 'awaiting' ? 'rgb(var(--purple-rgb) / 0.05)' : 'rgba(255,255,255,0.015)',
                padding: '0.7rem 0.9rem', opacity: row.suspended ? 0.5 : 1,
              }}
            >
              <div className="grow" style={{ minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: '0.88rem', color: CREAM, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {row.name}
                  {row.kind === 'volunteer' && <span style={{ fontSize: '0.62rem', letterSpacing: '0.08em', textTransform: 'uppercase', opacity: 0.55, marginLeft: '0.5rem', border: '1px solid rgb(var(--gold-rgb) / 0.3)', borderRadius: '9999px', padding: '0.05rem 0.4rem' }}>Volunteer</span>}
                  {row.suspended && <span style={{ fontSize: '0.68rem', opacity: 0.6, marginLeft: '0.5rem' }}>· paused</span>}
                </p>
                {state === 'paid' && (
                  <p style={{ margin: '0.15rem 0 0', fontSize: '0.72rem', opacity: 0.55 }}>
                    <span style={{ color: GOLD }}>✓ Paid</span>{row.paidAt ? ` · ${shortDate(row.paidAt)}` : ''}{row.note ? ` · ${row.note}` : ''}
                  </p>
                )}
                {state === 'awaiting' && (
                  <p style={{ margin: '0.15rem 0 0', fontSize: '0.72rem', opacity: 0.7 }}>
                    <span style={{ color: PURPLE }}>⧗ Member reported paying</span>{row.reportedAt ? ` · ${shortDate(row.reportedAt)}` : ''}
                  </p>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                {/* Note field to jot before flipping (only while not yet paid) */}
                {state !== 'paid' && (
                  <input
                    value={noteDraft[row.id] ?? ''}
                    onChange={e => setNoteDraft(d => ({ ...d, [row.id]: e.target.value }))}
                    placeholder="note (e.g. $50 e-transfer)"
                    style={{ ...inputStyle, width: '150px', fontSize: '0.75rem', padding: '0.3rem 0.5rem' }}
                  />
                )}
                {/* Dismiss an unconfirmed self-report without marking paid */}
                {state === 'awaiting' && (
                  <button
                    onClick={() => setPaid(row, false)}
                    disabled={loading}
                    title="Clear the member's claim — back to owed"
                    style={{ background: 'none', border: 'none', color: CREAM, opacity: loading ? 0.3 : 0.5, fontSize: '0.7rem', padding: '0.25rem 0.3rem', cursor: loading ? 'default' : 'pointer', fontFamily: 'inherit', textDecoration: 'underline', whiteSpace: 'nowrap' }}
                  >
                    Not received
                  </button>
                )}
                {/* Paid on/off toggle */}
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span style={{ fontSize: '0.68rem', letterSpacing: '0.06em', textTransform: 'uppercase', opacity: state === 'paid' ? 0.85 : 0.45, color: state === 'paid' ? GOLD : CREAM }}>Paid</span>
                  <button
                    onClick={() => setPaid(row, state !== 'paid')}
                    disabled={loading}
                    aria-pressed={state === 'paid'}
                    title={state === 'paid' ? 'Mark unpaid' : state === 'awaiting' ? 'Confirm payment' : 'Mark paid'}
                    style={{ width: '40px', height: '22px', borderRadius: '9999px', flexShrink: 0, border: 'none', cursor: loading ? 'default' : 'pointer', background: state === 'paid' ? GOLD : 'rgba(255,255,255,0.14)', transition: 'background 0.2s', position: 'relative', opacity: loading ? 0.5 : 1 }}
                  >
                    <div style={{ position: 'absolute', top: '3px', left: state === 'paid' ? '21px' : '3px', width: '16px', height: '16px', borderRadius: '50%', background: state === 'paid' ? 'var(--ink)' : 'rgba(255,255,255,0.5)', transition: 'left 0.2s' }} />
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      </>)}
    </div>
  )
}
