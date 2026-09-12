'use client'

// TimeField — styled replacement for <input type="time">, whose native picker
// is a white OS widget that clashes with the house ink/gold. A free-text input
// (accepts "7pm", "7:30 pm", "19:00", "730") over a 15-minute options list in
// the design language. Same contract as the native input: value is "HH:MM"
// (24h) or null, so callers don't change shape.
//
// With `durationFrom` set (an end-time field), the list starts just after the
// start time and each option shows the resulting duration — pick an end by
// how long the event runs, not by clock arithmetic.

import { useEffect, useRef, useState } from 'react'
import { parseHHMM, formatClock } from '@/lib/shift-hours'

const GOLD = 'var(--gold)'

function toHHMM(mins: number): string {
  const m = ((mins % 1440) + 1440) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

// Lenient parse: "7" → 07:00, "730" / "7:30" → 07:30, "7pm" → 19:00,
// "12am" → 00:00, "19:00" → 19:00. Null when it isn't a time.
export function parseLooseTime(text: string): string | null {
  const t = text.trim().toLowerCase().replace(/\./g, '')
  if (!t) return null
  const m = /^(\d{1,2})(?::?(\d{2}))?\s*(am?|pm?)?$/.exec(t)
  if (!m) return null
  let h = Number(m[1])
  const mm = m[2] != null ? Number(m[2]) : 0
  const mer = m[3]?.[0]
  if (mm > 59) return null
  if (mer === 'p' && h >= 1 && h <= 12) h = (h % 12) + 12
  else if (mer === 'a' && h >= 1 && h <= 12) h = h % 12
  if (h > 23) return null
  return toHHMM(h * 60 + mm)
}

function durationLabel(mins: number): string {
  if (mins < 60) return `${mins} min`
  const h = Math.round((mins / 60) * 100) / 100
  return `${h}h`
}

function buildOptions(durationFrom?: string | null): { value: string; label: string; hint?: string }[] {
  const from = parseHHMM(durationFrom ?? null)
  if (from != null) {
    // End-time flavour: 15 min to 12 h after the start (wraps past midnight).
    const opts: { value: string; label: string; hint: string }[] = []
    for (let step = 15; step <= 12 * 60; step += 15) {
      const v = toHHMM(from + step)
      opts.push({ value: v, label: formatClock(v), hint: durationLabel(step) })
    }
    return opts
  }
  const opts: { value: string; label: string }[] = []
  for (let m = 0; m < 1440; m += 15) {
    const v = toHHMM(m)
    opts.push({ value: v, label: formatClock(v) })
  }
  return opts
}

export function TimeField({ value, onChange, durationFrom, placeholder = 'e.g. 7:00 PM' }: {
  value: string | null
  onChange: (v: string | null) => void
  // "HH:MM" start time — switches the list to end-time flavour with durations.
  durationFrom?: string | null
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  // null = at rest (show the formatted value); a string while typing.
  const [text, setText] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const options = buildOptions(durationFrom)
  const display = text ?? (formatClock(value) || '')

  // Opening the list starts the scroll at the current value — or 9:00 AM as a
  // neutral anchor when empty (end-time lists just start at the top).
  useEffect(() => {
    if (!open || !listRef.current) return
    const anchor = value ?? (durationFrom ? null : '09:00')
    if (!anchor) { listRef.current.scrollTop = 0; return }
    const idx = options.findIndex(o => o.value === anchor)
    if (idx === -1) { listRef.current.scrollTop = 0; return }
    const el = listRef.current.children[idx] as HTMLElement | undefined
    if (el) listRef.current.scrollTop = el.offsetTop - listRef.current.clientHeight / 2 + el.clientHeight / 2
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const commitText = (raw: string) => {
    if (!raw.trim()) { onChange(null); return }
    const parsed = parseLooseTime(raw)
    if (parsed) onChange(parsed)
    // Unparseable text simply reverts to the previous value.
  }

  return (
    <div style={{ position: 'relative' }}>
      <style dangerouslySetInnerHTML={{ __html: '.timefield-opt:hover{background:rgb(var(--gold-rgb) / 0.12)}' }} />
      <input
        style={{
          width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgb(var(--gold-rgb) / 0.2)',
          borderRadius: '0.5rem', padding: '0.6rem 1.6rem 0.6rem 0.85rem', color: 'var(--cream)', fontSize: '0.875rem',
          fontFamily: 'var(--font-libre-baskerville), Georgia, serif', outline: 'none',
        }}
        value={display}
        placeholder={placeholder}
        onFocus={e => { setOpen(true); setText(display); e.target.select() }}
        onChange={e => { setText(e.target.value); setOpen(true) }}
        onBlur={() => { if (text != null) commitText(text); setText(null); setOpen(false) }}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur() }
          if (e.key === 'Escape') { setText(null); setOpen(false); (e.target as HTMLInputElement).blur() }
        }}
      />
      <span style={{
        position: 'absolute', right: '0.7rem', top: '50%', transform: 'translateY(-50%)',
        color: GOLD, opacity: 0.45, fontSize: '0.6rem', pointerEvents: 'none',
      }}>▾</span>
      {open && (
        <div
          ref={listRef}
          // Keep focus in the input so blur doesn't close the list before the click lands.
          onMouseDown={e => e.preventDefault()}
          style={{
            position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 60,
            maxHeight: '228px', overflowY: 'auto',
            background: '#241031', border: '1px solid rgb(var(--gold-rgb) / 0.3)', borderRadius: '0.5rem',
            boxShadow: '0 12px 32px rgba(0,0,0,0.55)',
          }}
        >
          {options.map(o => {
            const selected = o.value === value
            return (
              <button
                key={o.value}
                type="button"
                className="timefield-opt"
                onClick={() => { onChange(o.value); setText(null); setOpen(false) }}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.75rem',
                  width: '100%', textAlign: 'left', padding: '0.42rem 0.85rem',
                  background: selected ? 'rgb(var(--gold-rgb) / 0.14)' : 'none', border: 'none', cursor: 'pointer',
                  color: selected ? GOLD : 'var(--cream)', fontSize: '0.82rem',
                  fontFamily: 'var(--font-libre-baskerville), Georgia, serif',
                  fontWeight: selected ? 700 : 400, whiteSpace: 'nowrap',
                }}
              >
                <span>{o.label}</span>
                {o.hint && <span style={{ fontSize: '0.68rem', color: GOLD, opacity: 0.55 }}>{o.hint}</span>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
