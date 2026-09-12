'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  DISTINCTION_OPS,
  DISTINCTION_ENGRAVING_MAX,
  type DistinctionCondition,
  type DistinctionOp,
  type DistinctionRule,
} from '@/lib/distinctions'
import { AssetImagePicker, type GroupIconOption } from './AssetImagePicker'
import type { DistinctionCatalogEntry, DistinctionValueType } from '@/lib/profile-fields'
import { useConfirm } from '../components/ConfirmDialog'

const GOLD = 'var(--gold)'
const PURPLE = 'var(--purple)'
const CREAM = 'var(--cream)'

export type { GroupIconOption }

const isBoolOp = (op: DistinctionOp) => op === 'is_true' || op === 'is_false'
// Count ops compare the NUMBER of selected values, so their value input is numeric
// even though the fact itself is a list (string[]).
const isCountOp = (op: DistinctionOp) => op === 'count_gte'


const inputStyle: React.CSSProperties = {
  background: 'transparent', border: 'none',
  borderBottom: '1px solid rgb(var(--gold-rgb) / 0.2)',
  color: CREAM, fontSize: '0.85rem', outline: 'none',
  padding: '0 0 0.15rem', fontFamily: 'inherit', boxSizing: 'border-box',
}
const selectStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.04)', border: '1px solid rgb(var(--gold-rgb) / 0.2)',
  borderRadius: '0.3rem', color: CREAM, fontSize: '0.75rem',
  padding: '0.2rem 0.4rem', outline: 'none', fontFamily: 'inherit',
}
const tinyLabel: React.CSSProperties = {
  fontSize: '0.62rem', opacity: 0.4, letterSpacing: '0.08em',
  textTransform: 'uppercase', whiteSpace: 'nowrap',
}

export function DistinctionsManager({
  initialDistinctions,
  groupIconOptions,
  factCatalog,
}: {
  initialDistinctions: DistinctionRule[]
  groupIconOptions: GroupIconOption[]
  /** Facts a rule may reference — system (derived) + stored profile fields. */
  factCatalog: DistinctionCatalogEntry[]
}) {
  const factType = (key: string): DistinctionValueType =>
    factCatalog.find(f => f.key === key)?.type ?? 'string'
  const opsForFact = (key: string) =>
    DISTINCTION_OPS.filter(o => o.forTypes.includes(factType(key)))
  const numberFacts = factCatalog.filter(f => f.type === 'number')
  // Facts that actually represent a calendar year, for the "engraved year" picker —
  // excludes counts/durations like group count or years-since-joining.
  const yearFacts = numberFacts.filter(f =>
    f.key === 'joined_year' || (/\byear\b/i.test(f.label) && !/(since|ago|count|number|#)/i.test(f.label)),
  )

  // A new condition defaults to the first number fact (else first fact), with a
  // valid operator/value for its type.
  const defaultCondition = (): DistinctionCondition => {
    const f = numberFacts[0] ?? factCatalog[0]
    if (!f) return { fact: 'years_since_joined', op: 'gte', value: 1 }
    const op = opsForFact(f.key)[0]?.value ?? 'eq'
    return { fact: f.key, op, value: isBoolOp(op) ? undefined : (f.type === 'number' ? 1 : '') }
  }

  const [rules, setRules] = useState<DistinctionRule[]>(initialDistinctions)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { confirm, confirmDialog } = useConfirm()

  // Debounced autosave — same feedback pattern as the sibling Configure sections
  // (Attunement Tasks, Event Dates, Profile Fields): edit, then a transient
  // "Saved ✓" confirms.
  const save = useCallback((next: DistinctionRule[]) => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      try {
        const res = await fetch('/api/admin/page-content', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ config_distinctions: JSON.stringify(next) }),
        })
        if (!res.ok) {
          const d = await res.json().catch(() => ({}))
          setError(d.error ?? 'Failed to save')
          setSaved(false)
        } else {
          setError(null)
          setSaved(true)
          setTimeout(() => setSaved(false), 1800)
        }
      } catch {
        setError('Network error')
        setSaved(false)
      }
    }, 600)
  }, [])

  function update(next: DistinctionRule[]) { setRules(next); save(next) }
  const patch = (idx: number, change: Partial<DistinctionRule>) =>
    update(rules.map((r, i) => i === idx ? { ...r, ...change } : r))

  function patchCondition(ruleIdx: number, condIdx: number, change: Partial<DistinctionCondition>) {
    patch(ruleIdx, {
      conditions: rules[ruleIdx].conditions.map((c, i) => i === condIdx ? { ...c, ...change } : c),
    })
  }

  return (
    <div>
      <p style={{ fontSize: '0.78rem', opacity: 0.5, lineHeight: 1.6, margin: '0 0 1.25rem' }}>
        Distinctions are the engraved medals in each member&rsquo;s{' '}
        <strong style={{ opacity: 0.8 }}>Cabinet of Distinctions</strong>. They&rsquo;re earned
        automatically — a member receives one when their facts satisfy <em>all</em> of a rule&rsquo;s
        conditions. Medals are never assigned by hand; they&rsquo;re derived from member data, so they
        stay correct over time.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem', marginBottom: '1.25rem' }}>
        {rules.length === 0 && (
          <p style={{ textAlign: 'center', opacity: 0.4, fontStyle: 'italic', fontSize: '0.82rem', padding: '1rem 0' }}>
            No distinctions defined. The cabinet stays empty until you add one.
          </p>
        )}

        {rules.map((rule, idx) => (
          <div
            key={rule.id}
            style={{
              border: '1px solid rgb(var(--gold-rgb) / 0.15)', borderRadius: '0.75rem',
              background: 'rgb(var(--gold-rgb) / 0.02)', padding: '0.95rem 1rem',
              display: 'flex', gap: '0.75rem', alignItems: 'flex-start',
              opacity: rule.enabled ? 1 : 0.55,
            }}
          >
            {/* Enable toggle */}
            <button
              onClick={() => patch(idx, { enabled: !rule.enabled })}
              aria-pressed={rule.enabled}
              title={rule.enabled ? 'Active' : 'Disabled'}
              style={{
                width: '40px', height: '22px', borderRadius: '9999px', flexShrink: 0, marginTop: '0.15rem',
                border: 'none', cursor: 'pointer',
                background: rule.enabled ? GOLD : 'rgba(255,255,255,0.12)',
                transition: 'background 0.2s', position: 'relative',
              }}
            >
              <div style={{
                position: 'absolute', top: '3px', left: rule.enabled ? '21px' : '3px',
                width: '16px', height: '16px', borderRadius: '50%',
                background: rule.enabled ? 'var(--ink)' : 'rgba(255,255,255,0.5)',
                transition: 'left 0.2s',
              }} />
            </button>

            {/* Body */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.7rem', minWidth: 0 }}>
              {/* Label + description */}
              <input
                value={rule.label}
                onChange={e => patch(idx, { label: e.target.value })}
                placeholder="Label (e.g. Five Year Attunement)"
                style={{ ...inputStyle, width: '100%' }}
              />
              <input
                value={rule.description ?? ''}
                onChange={e => patch(idx, { description: e.target.value })}
                placeholder="Short caption (optional)"
                style={{ ...inputStyle, width: '100%', fontSize: '0.78rem', opacity: 0.85 }}
              />

              {/* Badge image — pick an included image or upload your own */}
              <AssetImagePicker
                value={rule.image}
                onChange={url => patch(idx, { image: url })}
                uploadUrl={`/api/admin/distinctions/${encodeURIComponent(rule.id)}/icon`}
                groupIconOptions={groupIconOptions}
                primaryCategory="distinction"
                label="Badge image"
              />

              {/* Conditions */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', borderLeft: '1px solid rgb(var(--gold-rgb) / 0.18)', paddingLeft: '0.7rem' }}>
                {/* How it's earned — segmented toggle between automatic (conditions) and by hand. */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                  <span style={{ ...tinyLabel, opacity: 0.5 }}>How it&rsquo;s earned</span>
                  <div style={{ display: 'inline-flex', border: '1px solid rgb(var(--gold-rgb) / 0.3)', borderRadius: '9999px', overflow: 'hidden' }}>
                    <button
                      onClick={() => { if (rule.conditions.length === 0) patch(idx, { conditions: [defaultCondition()] }) }}
                      title="Earned automatically when the member's facts meet conditions"
                      style={{ border: 'none', cursor: 'pointer', padding: '0.3rem 0.9rem', fontSize: '0.7rem', letterSpacing: '0.04em', background: rule.conditions.length > 0 ? GOLD : 'transparent', color: rule.conditions.length > 0 ? 'var(--ink)' : CREAM, fontWeight: rule.conditions.length > 0 ? 600 : 400, opacity: rule.conditions.length > 0 ? 1 : 0.6 }}
                    >Automatically</button>
                    <button
                      onClick={() => { if (rule.conditions.length > 0) patch(idx, { conditions: [], match: undefined }) }}
                      title="Granted by hand, per-member, from the member's admin page"
                      style={{ border: 'none', borderLeft: '1px solid rgb(var(--gold-rgb) / 0.3)', cursor: 'pointer', padding: '0.3rem 0.9rem', fontSize: '0.7rem', letterSpacing: '0.04em', background: rule.conditions.length === 0 ? PURPLE : 'transparent', color: rule.conditions.length === 0 ? '#fff' : CREAM, fontWeight: rule.conditions.length === 0 ? 600 : 400, opacity: rule.conditions.length === 0 ? 1 : 0.6 }}
                    >By hand</button>
                  </div>
                </div>

                {rule.conditions.length === 0 ? (
                  <span style={{ fontSize: '0.72rem', opacity: 0.45, fontStyle: 'italic', lineHeight: 1.5 }}>
                    Awarded by hand from a member&rsquo;s page: <strong style={{ opacity: 0.8 }}>Admin → open a member → Distinctions</strong>.
                  </span>
                ) : (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                    <span style={{ ...tinyLabel, opacity: 0.45 }}>Earned when</span>
                    {rule.conditions.length > 1 ? (
                      <select
                        value={rule.match ?? 'all'}
                        onChange={e => patch(idx, { match: e.target.value === 'any' ? 'any' : undefined })}
                        style={{ ...selectStyle, padding: '0.1rem 0.3rem' }}
                        title="ALL = every condition (AND) · ANY = at least one (OR)"
                      >
                        <option value="all" style={{ background: 'var(--ink)' }}>ALL</option>
                        <option value="any" style={{ background: 'var(--ink)' }}>ANY</option>
                      </select>
                    ) : (
                      <span style={{ ...tinyLabel, opacity: 0.45 }}>{(rule.match ?? 'all') === 'any' ? 'ANY' : 'ALL'}</span>
                    )}
                    <span style={{ ...tinyLabel, opacity: 0.45 }}>of:</span>
                  </span>
                )}
                {rule.conditions.map((c, ci) => {
                  const ops = opsForFact(c.fact)
                  return (
                    <div key={ci} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                      <select
                        value={c.fact}
                        onChange={e => {
                          const fact = e.target.value
                          const allowed = opsForFact(fact)
                          const op = allowed.some(o => o.value === c.op) ? c.op : allowed[0]?.value ?? 'eq'
                          patchCondition(idx, ci, { fact, op })
                        }}
                        style={selectStyle}
                      >
                        {factCatalog.map(f => (
                          <option key={f.key} value={f.key} style={{ background: 'var(--ink)' }}>{f.label}</option>
                        ))}
                      </select>
                      <select
                        value={c.op}
                        onChange={e => {
                          const op = e.target.value as DistinctionOp
                          const change: Partial<DistinctionCondition> = { op }
                          // Keep the value valid for the new operator's input kind.
                          if (isBoolOp(op)) change.value = undefined
                          else if (isCountOp(op) && typeof c.value !== 'number') change.value = 1
                          patchCondition(idx, ci, change)
                        }}
                        style={selectStyle}
                      >
                        {ops.map(o => (
                          <option key={o.value} value={o.value} style={{ background: 'var(--ink)' }}>{o.label}</option>
                        ))}
                      </select>
                      {!isBoolOp(c.op) && (() => {
                        const numeric = factType(c.fact) === 'number' || isCountOp(c.op)
                        return (
                          <input
                            value={c.value ?? ''}
                            onChange={e => {
                              const v = e.target.value
                              patchCondition(idx, ci, { value: numeric ? (v === '' ? undefined : Number(v)) : v })
                            }}
                            type={numeric ? 'number' : 'text'}
                            min={isCountOp(c.op) ? 1 : undefined}
                            placeholder={isCountOp(c.op) ? 'count' : 'value'}
                            style={{ ...selectStyle, width: '5rem' }}
                          />
                        )
                      })()}
                      <button
                        onClick={() => patch(idx, { conditions: rule.conditions.filter((_, i) => i !== ci) })}
                        title="Remove condition"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', opacity: 0.45, fontSize: '0.8rem', padding: '0 0.1rem' }}
                      >✕</button>
                    </div>
                  )
                })}
                {rule.conditions.length > 0 && (
                  <button
                    onClick={() => patch(idx, { conditions: [...rule.conditions, defaultCondition()] })}
                    style={{ alignSelf: 'flex-start', background: 'none', border: 'none', cursor: 'pointer', color: GOLD, opacity: 0.6, fontSize: '0.72rem', letterSpacing: '0.04em', padding: '0.1rem 0' }}
                  >+ Add condition</button>
                )}
              </div>

              {/* Engraving — optional static caption under the medal */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={tinyLabel}>Engraving</span>
                <input
                  value={rule.engraving ?? ''}
                  onChange={e => patch(idx, { engraving: e.target.value || undefined })}
                  maxLength={DISTINCTION_ENGRAVING_MAX}
                  placeholder="Optional caption under the medal"
                  title={`Short text engraved beneath the medal — up to ${DISTINCTION_ENGRAVING_MAX} characters`}
                  style={{ ...inputStyle, flex: 1, minWidth: '8rem', fontSize: '0.74rem' }}
                />
                <span style={{ ...tinyLabel, opacity: 0.4, fontVariantNumeric: 'tabular-nums' }}>
                  {(rule.engraving ?? '').length}/{DISTINCTION_ENGRAVING_MAX}
                </span>
              </div>

              {/* Year source */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={tinyLabel}>Engraved year</span>
                <select
                  value={rule.yearFact ?? ''}
                  onChange={e => patch(idx, { yearFact: e.target.value || undefined })}
                  style={selectStyle}
                >
                  <option value="" style={{ background: 'var(--ink)' }}>— none —</option>
                  {yearFacts.map(f => (
                    <option key={f.key} value={f.key} style={{ background: 'var(--ink)' }}>{f.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Move + delete */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flexShrink: 0 }}>
              <button
                onClick={() => {
                  if (idx === 0) return
                  const next = [...rules]
                  ;[next[idx - 1], next[idx]] = [next[idx], next[idx - 1]]
                  update(next)
                }}
                disabled={idx === 0}
                title="Move up"
                style={{ background: 'none', border: 'none', cursor: idx === 0 ? 'default' : 'pointer', color: GOLD, opacity: idx === 0 ? 0.2 : 0.5, fontSize: '0.75rem', padding: '0.1rem' }}
              >▲</button>
              <button
                onClick={() => {
                  if (idx === rules.length - 1) return
                  const next = [...rules]
                  ;[next[idx], next[idx + 1]] = [next[idx + 1], next[idx]]
                  update(next)
                }}
                disabled={idx === rules.length - 1}
                title="Move down"
                style={{ background: 'none', border: 'none', cursor: idx === rules.length - 1 ? 'default' : 'pointer', color: GOLD, opacity: idx === rules.length - 1 ? 0.2 : 0.5, fontSize: '0.75rem', padding: '0.1rem' }}
              >▼</button>
              <button
                onClick={async () => {
                  const ok = await confirm({
                    title: `Remove “${rule.label}”?`,
                    confirmLabel: 'Remove distinction',
                    danger: true,
                  })
                  if (ok) update(rules.filter((_, i) => i !== idx))
                }}
                title="Remove"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', opacity: 0.45, fontSize: '0.8rem', padding: '0.1rem', marginTop: '0.15rem' }}
              >✕</button>
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={() => update([
          ...rules,
          { id: `distinction-${Date.now()}`, label: 'New distinction', conditions: [defaultCondition()], enabled: true },
        ])}
        style={{
          width: '100%', padding: '0.65rem',
          border: '1px dashed rgb(var(--purple-rgb) / 0.25)',
          borderRadius: '0.75rem', background: 'transparent',
          color: PURPLE, fontSize: '0.8rem', letterSpacing: '0.08em',
          cursor: 'pointer', opacity: 0.6,
        }}
      >+ Add distinction</button>

      <div style={{ minHeight: '1.2rem', marginTop: '0.9rem' }}>
        {error
          ? <p style={{ fontSize: '0.75rem', color: 'var(--danger)', margin: 0 }}>{error}</p>
          : saved ? <p style={{ fontSize: '0.72rem', color: GOLD, opacity: 0.6, margin: 0 }}>Saved ✓</p>
          : null}
      </div>

      {confirmDialog}
    </div>
  )
}
