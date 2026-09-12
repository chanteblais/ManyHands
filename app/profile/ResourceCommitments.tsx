'use client'

import { useState, useEffect } from 'react'
import { IconImage } from '@/components/IconImage'
import { useRouter } from 'next/navigation'

// The member face of Shared Resources — now MEMBER-OWNED (2026-07-08): the
// admin authoring console is gone; approved members create lists and add/edit
// items right here. Editing is wiki-open (anyone approved can rename a list or
// edit its items); deleting a whole list is the one admin-gated action.
//
// It stays a coordination workspace, not an inventory. It answers "what can I
// do that would be most helpful?" first: a community pulse line, a top toolbar
// (＋ New list / ＋ Contribute something), a pinned I'M BRINGING card, one card
// per list with automatic health (Needs Attention / Almost Ready / Complete)
// and resource counts, dense task-list rows grouped Still Needed → Covered →
// Member Contributions, and expandable rows with claim + edit controls. See
// docs/shared-resources.md.

type Claimant = { name: string; quantity: number; me: boolean }
type ResourceItem = {
  id: string
  name: string
  note: string | null
  icon: string | null
  // NULL = an open offer (no set target) — added without a "how many needed".
  needed: number | null
  claimed: number
  mine: number
  claimants: Claimant[]
  offered_by_name: string | null
  offered_by_me: boolean
}
type ResourceList = {
  id: string
  title: string
  description: string | null
  // The list's steward — a group, department, or role name (display context
  // only; legacy admin-set, no longer editable here).
  steward_name: string | null
  // Opt-in to the home "Bring Something" dashboard widget (migration 070).
  show_on_dashboard: boolean
  items: ResourceItem[]
}
// Proof that people are preparing together — derived from claim timestamps.
type ResourcePulse = {
  contributorsToday: number
  latest: { name: string; itemName: string; coveredIt: boolean } | null
}

const GOLD = 'var(--gold)'
const GREEN = 'var(--success)'
const PURPLE = 'var(--purple)'
const LAVENDER = '#D9B8E8'
const CREAM = 'var(--cream)'

// Sentinel for the top-level "Contribute something" form (vs. a per-list
// footer, keyed by list id).
const TOP_FORM = '__top__'

const groupLabelStyle: React.CSSProperties = {
  fontSize: '0.66rem', letterSpacing: '0.2em', textTransform: 'uppercase',
  margin: '0 0 0.6rem',
}

function claimantLine(c: Claimant) {
  return c.quantity > 1 ? `${c.name} ×${c.quantity}` : c.name
}

// Server-rendered pages pass the same shape /api/resources returns
// (lib/resources.ts → getMemberResourceView), so the section renders with its
// data already in place and skips the fetch-after-hydration round-trip.
// `canManage` = approved + not suspended (may create/edit); `canDeleteLists` =
// admin (the one destructive guardrail).
export function ResourceCommitments({
  initialLists,
  initialPulse,
  canManage = true,
  canDeleteLists = false,
}: {
  initialLists?: ResourceList[]
  initialPulse?: ResourcePulse
  canManage?: boolean
  canDeleteLists?: boolean
}) {
  const router = useRouter()
  const [lists, setLists] = useState<ResourceList[] | null>(initialLists ?? null)
  const [pulse, setPulse] = useState<ResourcePulse | null>(initialPulse ?? null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  // Lists start COLLAPSED — the board is a scannable index of every list
  // (empty ones included); tap a header to open it. Tracks which are open.
  const [openLists, setOpenLists] = useState<Set<string>>(new Set())

  // The "add an item" form. Open on at most one target at a time: TOP_FORM
  // (top-level, with a list picker) or a specific list id (footer).
  const [openForm, setOpenForm] = useState<string | null>(null)
  const [formListId, setFormListId] = useState<string>('') // chosen list for TOP_FORM
  const [formName, setFormName] = useState('')
  const [formNote, setFormNote] = useState('')
  const [formNeeded, setFormNeeded] = useState('') // optional target; '' = open offer
  const [formBring, setFormBring] = useState(true)
  const [formBusy, setFormBusy] = useState(false)

  // Create a new list (top toolbar).
  const [newListOpen, setNewListOpen] = useState(false)
  const [newListTitle, setNewListTitle] = useState('')
  const [newListDesc, setNewListDesc] = useState('')
  const [newListDash, setNewListDash] = useState(false)
  const [newListBusy, setNewListBusy] = useState(false)

  // Inline edit of a list header (wiki).
  const [editListId, setEditListId] = useState<string | null>(null)
  const [editListTitle, setEditListTitle] = useState('')
  const [editListDesc, setEditListDesc] = useState('')
  const [editListDash, setEditListDash] = useState(false)

  // Inline edit of an item (wiki).
  const [editItemId, setEditItemId] = useState<string | null>(null)
  const [editItemName, setEditItemName] = useState('')
  const [editItemNote, setEditItemNote] = useState('')
  const [editItemNeeded, setEditItemNeeded] = useState('')

  const load = () =>
    fetch('/api/resources')
      .then(r => r.json())
      .then(d => { setLists(d.lists ?? []); setPulse(d.pulse ?? null) })
      .catch(() => setLists([]))

  useEffect(() => {
    if (initialLists) return
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Deep links (/participate#bring, e.g. from the home widget): the sections
  // now arrive server-rendered, but late layout shifts (images, fonts) can
  // still nudge the anchor, and a single scroll — native or ours — gets undone
  // when later content lands above the anchor and pushes it down. Instead, pin
  // the anchor on every layout change for the first few seconds, then let go.
  // The first wheel or touch hands control back to the user immediately.
  useEffect(() => {
    if (window.location.hash !== '#bring') return
    let cancelled = false
    const cancel = () => { cancelled = true }
    window.addEventListener('wheel', cancel, { passive: true })
    window.addEventListener('touchstart', cancel, { passive: true })
    const snap = () => { if (!cancelled) document.getElementById('bring')?.scrollIntoView({ block: 'start' }) }
    const ro = new ResizeObserver(snap)
    ro.observe(document.body)
    snap()
    const stop = setTimeout(() => ro.disconnect(), 3000)
    return () => {
      clearTimeout(stop)
      ro.disconnect()
      window.removeEventListener('wheel', cancel)
      window.removeEventListener('touchstart', cancel)
    }
  }, [])

  const toggleExpanded = (id: string) =>
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const toggleList = (id: string) =>
    setOpenLists(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const expandList = (id: string) => setOpenLists(prev => new Set(prev).add(id))

  // My claim on `item` becomes `qty` — locally adjust mine, the total, AND my
  // entry in the visible claimant names, so the board stays truthful mid-flight.
  const applyMine = (item: ResourceItem, qty: number) => (i: ResourceItem): ResourceItem => {
    if (i.id !== item.id) return i
    const others = i.claimants.filter(c => !c.me)
    return {
      ...i,
      mine: qty,
      claimed: i.claimed - i.mine + qty,
      claimants: qty > 0 ? [{ name: 'You', quantity: qty, me: true }, ...others] : others,
    }
  }

  async function setClaim(item: ResourceItem, quantity: number) {
    const qty = Math.min(99, Math.max(0, quantity))
    if (qty === item.mine) return
    setBusyId(item.id)
    setError(null)
    setLists(prev => prev?.map(l => ({ ...l, items: l.items.map(applyMine(item, qty)) })) ?? prev)

    const res = await fetch('/api/resources/claims', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resource_id: item.id, quantity: qty }),
    })

    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setError(d.error ?? 'Could not update. Try again.')
      // Revert (applyMine reads the current state's own quantity, so setting
      // back to the original target undoes the optimistic step)
      setLists(prev => prev?.map(l => ({ ...l, items: l.items.map(applyMine(item, item.mine)) })) ?? prev)
    } else {
      // Retracting your own contribution may delete the listing server-side —
      // refetch so the row disappears (or stays, if others piled on) truthfully.
      if (item.offered_by_me && qty === 0) await load()
      // Refresh server components (profile commitments card) on next nav.
      router.refresh()
    }
    setBusyId(null)
  }

  // ── Add-item form ──────────────────────────────────────────────────────────
  const resetForm = () => { setFormName(''); setFormNote(''); setFormNeeded(''); setFormBring(true) }
  const closeForm = () => { setOpenForm(null); resetForm() }
  // Open the form against a target: TOP_FORM (pre-select the only list if there
  // is exactly one, else force a choice) or a specific list id.
  const openContribute = (target: string) => {
    resetForm()
    setFormListId(target === TOP_FORM && lists?.length === 1 ? lists[0].id : '')
    setOpenForm(target)
  }

  async function submitItem(listId: string) {
    if (!listId || !formName.trim()) return
    setFormBusy(true)
    setError(null)
    const res = await fetch('/api/resources/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        list_id: listId,
        name: formName,
        note: formNote,
        quantity_needed: formNeeded.trim() === '' ? null : Number(formNeeded),
        bring: formBring,
      }),
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setError(d.error ?? 'Could not add it. Try again.')
    } else {
      closeForm()
      expandList(listId) // so the just-added item is visible
      await load()
      router.refresh()
    }
    setFormBusy(false)
  }

  // ── List create / edit / delete ─────────────────────────────────────────────
  async function submitNewList() {
    if (!newListTitle.trim()) return
    setNewListBusy(true)
    setError(null)
    const res = await fetch('/api/resources/lists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newListTitle, description: newListDesc, show_on_dashboard: newListDash }),
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setError(d.error ?? 'Could not create the list. Try again.')
    } else {
      const created = await res.json().catch(() => ({}))
      setNewListOpen(false); setNewListTitle(''); setNewListDesc(''); setNewListDash(false)
      if (created?.list?.id) expandList(created.list.id) // open the new list to fill it
      await load()
      router.refresh()
    }
    setNewListBusy(false)
  }

  const openEditList = (list: ResourceList) => {
    setEditListId(list.id); setEditListTitle(list.title); setEditListDesc(list.description ?? ''); setEditListDash(list.show_on_dashboard)
  }
  async function submitEditList(listId: string) {
    if (!editListTitle.trim()) return
    setError(null)
    const res = await fetch(`/api/resources/lists/${listId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: editListTitle, description: editListDesc, show_on_dashboard: editListDash }),
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setError(d.error ?? 'Could not save the list. Try again.')
    } else {
      setEditListId(null)
      await load()
      router.refresh()
    }
  }
  async function deleteList(list: ResourceList) {
    const itemCount = list.items.length
    const claimCount = list.items.reduce((s, i) => s + i.claimants.length, 0)
    const detail = itemCount || claimCount
      ? ` This removes ${itemCount} item${itemCount === 1 ? '' : 's'}${claimCount ? ` and ${claimCount} commitment${claimCount === 1 ? '' : 's'}` : ''}.`
      : ''
    if (!window.confirm(`Delete "${list.title}"?${detail} This can't be undone.`)) return
    setError(null)
    const res = await fetch(`/api/resources/lists/${list.id}`, { method: 'DELETE' })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setError(d.error ?? 'Could not delete the list. Try again.')
    } else {
      await load()
      router.refresh()
    }
  }

  // ── Item edit / delete ───────────────────────────────────────────────────────
  const openEditItem = (item: ResourceItem) => {
    setEditItemId(item.id)
    setEditItemName(item.name)
    setEditItemNote(item.note ?? '')
    setEditItemNeeded(item.needed === null ? '' : String(item.needed))
  }
  async function submitEditItem(itemId: string) {
    if (!editItemName.trim()) return
    setBusyId(itemId)
    setError(null)
    const res = await fetch(`/api/resources/items/${itemId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: editItemName,
        note: editItemNote,
        quantity_needed: editItemNeeded.trim() === '' ? null : Number(editItemNeeded),
      }),
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setError(d.error ?? 'Could not save. Try again.')
    } else {
      setEditItemId(null)
      await load()
      router.refresh()
    }
    setBusyId(null)
  }
  async function deleteItem(item: ResourceItem) {
    const others = item.claimants.filter(c => !c.me).length
    const warn = item.claimants.length
      ? ` ${item.claimants.length} ${item.claimants.length === 1 ? 'person is' : 'people are'} bringing it${others ? ' (including others)' : ''}.`
      : ''
    if (!window.confirm(`Remove "${item.name}"?${warn} This can't be undone.`)) return
    setBusyId(item.id)
    setError(null)
    const res = await fetch(`/api/resources/items/${item.id}`, { method: 'DELETE' })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setError(d.error ?? 'Could not remove it. Try again.')
    } else {
      await load()
      router.refresh()
    }
    setBusyId(null)
  }

  if (lists === null) {
    return <p style={{ fontSize: '0.85rem', opacity: 0.4 }}>Loading…</p>
  }

  // ── I'M BRINGING — everything I've committed to, pinned up top ──
  const myCommitments = lists.flatMap(l =>
    l.items.filter(i => i.mine > 0).map(i => ({ item: i, listTitle: l.title, listId: l.id })))

  const jumpToItem = (id: string, listId: string) => {
    expandList(listId) // the item only renders once its list is open
    setExpanded(prev => new Set(prev).add(id))
    // Let the expansion render before scrolling to it.
    setTimeout(() => document.getElementById(`res-item-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60)
  }

  const stepBtn: React.CSSProperties = {
    width: '28px', height: '28px', borderRadius: '50%', flexShrink: 0,
    border: `1px solid rgb(var(--purple-rgb) / 0.45)`, background: 'rgb(var(--purple-rgb) / 0.1)',
    color: PURPLE, cursor: 'pointer', fontSize: '0.9rem', lineHeight: 1,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  }
  const claimBtn = (label: string, onClick: () => void, busy: boolean): React.ReactNode => (
    <button
      disabled={busy}
      onClick={e => { e.stopPropagation(); onClick() }}
      style={{
        flexShrink: 0, fontSize: '0.72rem', letterSpacing: '0.06em', padding: '0.4rem 0.95rem',
        borderRadius: '9999px', whiteSpace: 'nowrap', cursor: busy ? 'wait' : 'pointer',
        border: `1px solid rgb(var(--gold-rgb) / 0.45)`, color: 'var(--lemon)', background: 'rgb(var(--gold-rgb) / 0.08)',
      }}
    >
      {label}
    </button>
  )
  // Small tertiary text link (Edit / Remove / Cancel).
  const textLink = (label: string, onClick: () => void, color = GOLD): React.ReactNode => (
    <button
      onClick={e => { e.stopPropagation(); onClick() }}
      style={{ background: 'none', border: 'none', padding: 0, color, opacity: 0.65, cursor: 'pointer', fontSize: '0.72rem', letterSpacing: '0.05em', fontFamily: 'inherit' }}
    >
      {label}
    </button>
  )

  const fieldStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgb(var(--gold-rgb) / 0.25)', borderRadius: '0.5rem',
    padding: '0.55rem 0.8rem', color: CREAM, fontSize: '0.85rem', outline: 'none',
    fontFamily: 'inherit', marginBottom: '0.5rem',
  }
  const pillBtn = (label: string, onClick: () => void, disabled: boolean, primary: boolean): React.ReactNode => (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '0.4rem 0.9rem', borderRadius: '9999px', cursor: disabled ? 'default' : 'pointer',
        border: `1px solid rgb(var(--gold-rgb) / ${primary ? 0.45 : 0.2})`, background: 'transparent',
        color: primary ? 'var(--lemon)' : CREAM, fontSize: '0.75rem', letterSpacing: '0.05em',
        fontFamily: 'inherit', opacity: disabled ? 0.5 : primary ? 1 : 0.7,
      }}
    >
      {label}
    </button>
  )

  // "Show on the home dashboard" opt-in (migration 070) — shared by the new-
  // and edit-list forms.
  const dashCheckbox = (checked: boolean, onChange: (v: boolean) => void): React.ReactNode => (
    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.78rem', opacity: 0.75, cursor: 'pointer', userSelect: 'none', marginBottom: '0.75rem' }}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} style={{ accentColor: GOLD }} />
      Show this list on the home dashboard
    </label>
  )

  // One shared "add an item" form. When `showPicker`, the member chooses which
  // list to add to (top-level entry); otherwise the list is fixed (footer).
  const renderAddItemForm = (showPicker: boolean, fixedListId: string) => {
    const targetListId = showPicker ? formListId : fixedListId
    return (
      <div style={{ padding: '1rem 1.25rem 1.1rem', background: 'rgb(var(--gold-rgb) / 0.03)' }}>
        {showPicker && (
          <select
            value={formListId}
            onChange={e => setFormListId(e.target.value)}
            style={{ ...fieldStyle, appearance: 'none', cursor: 'pointer', color: formListId ? CREAM : 'rgb(var(--cream-rgb) / 0.5)' }}
          >
            <option value="" disabled>Which list is it for?</option>
            {lists.map(l => (
              <option key={l.id} value={l.id} style={{ background: 'var(--ink)', color: CREAM }}>{l.title}</option>
            ))}
          </select>
        )}
        <input
          autoFocus
          value={formName}
          onChange={e => setFormName(e.target.value)}
          placeholder="What would you like to add? (e.g. Sharp knives)"
          maxLength={80}
          style={fieldStyle}
        />
        <input
          value={formNote}
          onChange={e => setFormNote(e.target.value)}
          placeholder="Details (optional)"
          maxLength={200}
          style={{ ...fieldStyle, fontSize: '0.8rem', border: '1px solid rgb(var(--gold-rgb) / 0.2)' }}
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.8rem', opacity: 0.75, marginBottom: '0.65rem' }}>
          <span style={{ whiteSpace: 'nowrap' }}>How many needed?</span>
          <input
            value={formNeeded}
            onChange={e => setFormNeeded(e.target.value.replace(/[^0-9]/g, '').slice(0, 2))}
            inputMode="numeric"
            placeholder="optional"
            style={{ ...fieldStyle, width: '6.5rem', marginBottom: 0, padding: '0.4rem 0.7rem' }}
          />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.78rem', opacity: 0.7, cursor: 'pointer', userSelect: 'none', marginBottom: '0.75rem' }}>
          <input type="checkbox" checked={formBring} onChange={e => setFormBring(e.target.checked)} style={{ accentColor: GOLD }} />
          I&rsquo;m bringing this myself
        </label>
        <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-end' }}>
          {pillBtn('Cancel', closeForm, false, false)}
          {pillBtn(formBusy ? 'Adding…' : 'Add it', () => submitItem(targetListId), formBusy || !targetListId || !formName.trim(), true)}
        </div>
      </div>
    )
  }

  const renderItem = (item: ResourceItem, idx: number) => {
    const busy = busyId === item.id
    const isContribution = item.needed === null
    const remaining = isContribution ? 0 : Math.max(0, (item.needed as number) - item.claimed)
    const covered = !isContribution && remaining === 0
    const isOpen = expanded.has(item.id)
    const isEditing = editItemId === item.id
    const claimedByMe = item.mine > 0
    // Names inline on the meta line — scannable social proof (first two).
    const inlineNames = item.claimants.slice(0, 2).map(c => c.name).join(', ')
    const moreNames = item.claimants.length - 2

    return (
      // Dense task-list rows: hairline-divided inside the group's container
      // (a list may grow to dozens of items — scannability wins over chrome).
      <div
        key={item.id}
        id={`res-item-${item.id}`}
        style={{
          borderTop: idx > 0 ? '1px solid rgb(var(--gold-rgb) / 0.1)' : 'none',
          background: claimedByMe ? 'rgb(var(--purple-rgb) / 0.05)' : 'transparent',
          transition: 'background 0.15s', opacity: busy ? 0.6 : 1,
        }}
      >
        {/* Compact row — click to expand */}
        <div
          onClick={() => toggleExpanded(item.id)}
          style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 1rem', cursor: 'pointer' }}
        >
          <div style={{ width: 26, height: 26, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {item.icon
              ? <IconImage src={item.icon} size="100%" fill={0.85} />
              : <span style={{ fontSize: '0.95rem', color: GOLD, opacity: 0.4 }}>✦</span>}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: '0.88rem', color: CREAM, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</p>
            {/* What matters most, first: the shortage — not the count. */}
            <p style={{ margin: '0.1rem 0 0', fontSize: '0.72rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {isContribution ? (
                <span style={{ color: LAVENDER, opacity: 0.85, fontStyle: 'italic' }}>
                  Added by {item.offered_by_me ? 'you' : item.offered_by_name ?? 'a member'}
                  {item.claimed > 0 ? ` · ${item.claimed} being brought` : ' · nobody bringing it yet'}
                </span>
              ) : covered ? (
                <span style={{ color: GREEN, opacity: 0.9 }}>✓ Covered · {item.claimed} of {item.needed}</span>
              ) : (
                <>
                  <span style={{ color: GOLD, fontWeight: 700 }}>Still need: {remaining}</span>
                  <span style={{ color: CREAM, opacity: 0.4 }}> · {item.claimed} of {item.needed} committed</span>
                </>
              )}
              {item.claimants.length > 0 && (
                <span style={{ color: CREAM, opacity: 0.5 }}> · <span style={{ color: GREEN }}>✓</span> {inlineNames}{moreNames > 0 ? ` +${moreNames}` : ''}</span>
              )}
            </p>
          </div>

          {/* Primary action stays one click away on open needs */}
          {!covered && !isContribution && !claimedByMe && claimBtn("I'll bring one", () => setClaim(item, 1), busy)}
          <span aria-hidden style={{ color: GOLD, opacity: 0.4, fontSize: '0.8rem', flexShrink: 0, transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>›</span>
        </div>

        {/* Expanded detail — all the depth, only on demand */}
        {isOpen && (
          <div style={{ padding: '0 1rem 0.95rem 3.4rem', borderTop: '1px solid rgb(var(--gold-rgb) / 0.08)' }}>
            {isEditing ? (
              /* Inline item edit (wiki) */
              <div style={{ margin: '0.85rem 0 0' }}>
                <input
                  autoFocus value={editItemName} onChange={e => setEditItemName(e.target.value)}
                  placeholder="Item name" maxLength={80} style={fieldStyle}
                />
                <input
                  value={editItemNote} onChange={e => setEditItemNote(e.target.value)}
                  placeholder="Details (optional)" maxLength={200}
                  style={{ ...fieldStyle, fontSize: '0.8rem', border: '1px solid rgb(var(--gold-rgb) / 0.2)' }}
                />
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.8rem', opacity: 0.75, marginBottom: '0.7rem' }}>
                  <span style={{ whiteSpace: 'nowrap' }}>How many needed?</span>
                  <input
                    value={editItemNeeded}
                    onChange={e => setEditItemNeeded(e.target.value.replace(/[^0-9]/g, '').slice(0, 2))}
                    inputMode="numeric" placeholder="optional"
                    style={{ ...fieldStyle, width: '6.5rem', marginBottom: 0, padding: '0.4rem 0.7rem' }}
                  />
                </label>
                <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-end' }}>
                  {pillBtn('Cancel', () => setEditItemId(null), false, false)}
                  {pillBtn(busy ? 'Saving…' : 'Save', () => submitEditItem(item.id), busy || !editItemName.trim(), true)}
                </div>
              </div>
            ) : (
              <>
                {item.note && (
                  <p style={{ margin: '0.8rem 0 0', fontSize: '0.78rem', opacity: 0.55, fontStyle: 'italic', lineHeight: 1.5 }}>{item.note}</p>
                )}

                {/* Who's bringing it — social proof */}
                <div style={{ margin: '0.8rem 0 0' }}>
                  {item.claimants.length === 0 ? (
                    <p style={{ margin: 0, fontSize: '0.78rem', opacity: 0.4, fontStyle: 'italic' }}>Nobody yet — be the first.</p>
                  ) : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem 0.9rem' }}>
                      {item.claimants.map((c, i) => (
                        <span key={i} style={{ fontSize: '0.78rem', color: c.me ? PURPLE : CREAM, opacity: c.me ? 1 : 0.75 }}>
                          <span style={{ color: GREEN }}>✓</span> {claimantLine(c)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* My commitment controls */}
                <div style={{ margin: '0.9rem 0 0', display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                  {claimedByMe ? (
                    <>
                      <span style={{ fontSize: '0.78rem', color: PURPLE, opacity: 0.85 }}>You&rsquo;re bringing</span>
                      <button style={stepBtn} disabled={busy} onClick={() => setClaim(item, item.mine - 1)} aria-label="Bring one fewer">−</button>
                      <span style={{ fontSize: '0.85rem', color: PURPLE, minWidth: '1.2rem', textAlign: 'center' }}>{item.mine}</span>
                      <button style={stepBtn} disabled={busy} onClick={() => setClaim(item, item.mine + 1)} aria-label="Bring one more">+</button>
                      {textLink('Remove', () => setClaim(item, 0), 'var(--danger)')}
                    </>
                  ) : (
                    claimBtn(covered ? '＋ Bring an extra' : "＋ I'll bring one", () => setClaim(item, 1), busy)
                  )}
                </div>

                {/* Wiki management — any approved member can edit/remove */}
                {canManage && (
                  <div style={{ margin: '0.85rem 0 0', display: 'flex', gap: '1rem', alignItems: 'center', borderTop: '1px solid rgb(var(--gold-rgb) / 0.08)', paddingTop: '0.7rem' }}>
                    {textLink('Edit item', () => openEditItem(item))}
                    {textLink('Remove item', () => deleteItem(item), 'var(--danger)')}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    )
  }

  const renderList = (list: ResourceList) => {
    const targeted = list.items.filter(i => i.needed !== null)
    // Resource COUNTS, not unit percentages — one generator isn't one fork,
    // so "18 of 22 resources covered" is harder to misinterpret than "82%".
    const coveredItems = targeted.filter(i => i.claimed >= (i.needed as number)).length
    const itemsShort = targeted.length - coveredItems
    // Automatic list health, worst → best.
    const status = targeted.length === 0 ? null
      : itemsShort === 0 ? 'complete'
      : itemsShort <= 2 || coveredItems / targeted.length >= 0.8 ? 'almost'
      : 'attention'

    const stillNeeded = list.items.filter(i => i.needed !== null && i.claimed < (i.needed as number))
    const covered = list.items.filter(i => i.needed !== null && i.claimed >= (i.needed as number))
    const contributed = list.items.filter(i => i.needed === null)
    const isEditingList = editListId === list.id
    const isOpen = openLists.has(list.id)
    const totalItems = list.items.length
    // Collapsed one-liner — every list reads as an index row, empty or full.
    // A list with no tracked needs is an OPEN CALL (nothing prescribed — bring
    // what fits), so it reads as an invitation rather than an empty inventory.
    const summary =
      totalItems === 0 ? 'Open call — tap to contribute'
      : targeted.length === 0 ? `Open call · ${totalItems} item${totalItems === 1 ? '' : 's'}`
      : itemsShort > 0 ? `${itemsShort} still needed · ${totalItems} item${totalItems === 1 ? '' : 's'}`
      : `All covered · ${totalItems} item${totalItems === 1 ? '' : 's'}`

    const pill = status && (
      <span style={{
        fontSize: '0.6rem', letterSpacing: '0.16em', textTransform: 'uppercase',
        padding: '0.25rem 0.7rem', borderRadius: '9999px', whiteSpace: 'nowrap',
        color: status === 'complete' ? GREEN : status === 'almost' ? GOLD : PURPLE,
        border: `1px solid ${status === 'complete' ? 'rgb(var(--success-rgb) / 0.45)' : status === 'almost' ? 'rgb(var(--gold-rgb) / 0.45)' : 'rgb(var(--purple-rgb) / 0.4)'}`,
        background: status === 'complete' ? 'rgb(var(--success-rgb) / 0.08)' : status === 'almost' ? 'rgb(var(--gold-rgb) / 0.07)' : 'rgb(var(--purple-rgb) / 0.07)',
      }}>
        {status === 'complete' ? 'Complete' : status === 'almost' ? 'Almost Ready' : 'Needs Attention'}
      </span>
    )

    return (
      // One list = one collapsible card. Collapsed by default: a header row
      // (title + health + summary) so the board is a scannable index of every
      // list. Open it to see items + add. Empty lists read just as clearly.
      <div key={list.id} style={{ border: '1px solid rgb(var(--gold-rgb) / 0.25)', borderRadius: '1rem', background: 'rgba(10,0,20,0.5)', overflow: 'hidden' }}>
        {isEditingList ? (
          /* Inline list header edit (wiki) */
          <div style={{ padding: '1.1rem 1.25rem' }}>
            <input
              autoFocus value={editListTitle} onChange={e => setEditListTitle(e.target.value)}
              placeholder="List title" maxLength={80} style={{ ...fieldStyle, fontSize: '1rem' }}
            />
            <input
              value={editListDesc} onChange={e => setEditListDesc(e.target.value)}
              placeholder="Description (optional)" maxLength={300}
              style={{ ...fieldStyle, fontSize: '0.82rem', border: '1px solid rgb(var(--gold-rgb) / 0.2)' }}
            />
            {dashCheckbox(editListDash, setEditListDash)}
            <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-end' }}>
              {pillBtn('Cancel', () => setEditListId(null), false, false)}
              {pillBtn('Save', () => submitEditList(list.id), !editListTitle.trim(), true)}
            </div>
          </div>
        ) : (
          <>
            {/* Header row — the whole row toggles open/closed */}
            <div
              onClick={() => toggleList(list.id)}
              style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', padding: '1rem 1.25rem', cursor: 'pointer' }}
            >
              <span aria-hidden style={{ color: GOLD, opacity: 0.5, fontSize: '0.9rem', flexShrink: 0, transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>›</span>
              <p style={{ margin: 0, flex: 1, minWidth: 0, fontSize: '1.2rem', letterSpacing: '0.05em', color: GOLD, opacity: 0.95, fontFamily: 'var(--font-display)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {list.title}
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', flexShrink: 0 }}>
                {pill}
                {isOpen ? (
                  <>
                    {canManage && textLink('Edit', () => openEditList(list))}
                    {canDeleteLists && textLink('Delete', () => deleteList(list), 'var(--danger)')}
                  </>
                ) : (
                  <span style={{ fontSize: '0.72rem', color: CREAM, opacity: 0.45, whiteSpace: 'nowrap' }}>{summary}</span>
                )}
              </div>
            </div>

            {isOpen && (
              <div style={{ borderTop: '1px solid rgb(var(--gold-rgb) / 0.12)' }}>
                {/* Description + health copy — the shared goal, on demand.
                    No tracked needs (status null) = an open call: an
                    invitation to contribute, not an inventory to fill. */}
                <div style={{ padding: '0.95rem 1.25rem 0.2rem' }}>
                    {(list.description || list.steward_name) && (
                      <p style={{ margin: 0, fontSize: '0.78rem', opacity: 0.45, lineHeight: 1.5 }}>
                        {[list.description, list.steward_name ? `Stewarded by ${list.steward_name}` : null].filter(Boolean).join(' · ')}
                      </p>
                    )}
                    {status === null && (
                      <p style={{ margin: list.description || list.steward_name ? '0.5rem 0 0' : 0, fontSize: '0.82rem', color: GOLD, opacity: 0.8 }}>
                        ✦ An open call — bring whatever you think would help.
                      </p>
                    )}
                    {status === 'complete' ? (
                      <p style={{ margin: '0.5rem 0 0', fontSize: '0.82rem', color: GREEN, opacity: 0.9 }}>
                        ✨ {list.title} is fully equipped! Thanks to everyone contributing.
                      </p>
                    ) : status ? (
                      <>
                        {status === 'almost' && (
                          <p style={{ margin: '0.5rem 0 0', fontSize: '0.82rem', color: GOLD, opacity: 0.9 }}>
                            ✨ {list.title} is almost ready — only {itemsShort} more item{itemsShort === 1 ? '' : 's'} needed.
                          </p>
                        )}
                        <p style={{ margin: '0.4rem 0 0', fontSize: '0.72rem', opacity: 0.45 }}>
                          {coveredItems} of {targeted.length} resources covered · {itemsShort} still need{itemsShort === 1 ? 's' : ''} attention
                        </p>
                      </>
                    ) : null}
                </div>

                {/* Items grouped by what needs attention */}
                {list.items.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', padding: '1.1rem 1.25rem 1.25rem' }}>
                    {stillNeeded.length > 0 && (
                      <div>
                        <p style={{ ...groupLabelStyle, color: GOLD, opacity: 0.75 }}>Still Needed</p>
                        <div style={{ border: '1px solid rgb(var(--gold-rgb) / 0.14)', borderRadius: '0.6rem', overflow: 'hidden' }}>
                          {stillNeeded.map(renderItem)}
                        </div>
                      </div>
                    )}
                    {covered.length > 0 && (
                      <div>
                        <p style={{ ...groupLabelStyle, color: GREEN, opacity: 0.6 }}>Covered</p>
                        <div style={{ border: '1px solid rgb(var(--gold-rgb) / 0.14)', borderRadius: '0.6rem', overflow: 'hidden', opacity: 0.8 }}>
                          {covered.map(renderItem)}
                        </div>
                      </div>
                    )}
                    {contributed.length > 0 && (
                      <div>
                        <p style={{ ...groupLabelStyle, color: LAVENDER, opacity: 0.65 }}>Member Contributions</p>
                        <div style={{ border: '1px solid rgb(var(--gold-rgb) / 0.14)', borderRadius: '0.6rem', overflow: 'hidden' }}>
                          {contributed.map(renderItem)}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Add an item to this list (wiki). A footer OF the card. */}
                {canManage && (
                  <div style={{ borderTop: '1px solid rgb(var(--gold-rgb) / 0.12)' }}>
                    {openForm === list.id ? (
                      renderAddItemForm(false, list.id)
                    ) : (
                      <button
                        onClick={() => openContribute(list.id)}
                        style={{
                          display: 'block', width: '100%', boxSizing: 'border-box', textAlign: 'center',
                          padding: '0.85rem 1.25rem', cursor: 'pointer',
                          border: 'none', background: 'transparent',
                          color: GOLD, opacity: 0.65, fontSize: '0.78rem',
                          letterSpacing: '0.05em', fontFamily: 'inherit',
                        }}
                      >
                        ＋ Add something to this list
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    )
  }

  // The pulse — one quiet line of proof that people are preparing together.
  const pulseLine = !pulse ? null
    : pulse.contributorsToday >= 3
      ? `✦ ${pulse.contributorsToday} members contributed resources today — thank you.`
      : pulse.latest
        ? pulse.latest.coveredIt
          ? `✨ ${pulse.latest.name} just covered the last ${pulse.latest.itemName}!`
          : `✦ ${pulse.latest.name} just committed to bringing ${pulse.latest.itemName}.`
        : null

  // New-list form / button (top toolbar + empty state share it).
  const newListForm = (
    <div style={{
      borderRadius: '0.85rem', overflow: 'hidden',
      border: `1px solid rgb(var(--gold-rgb) / ${newListOpen ? 0.35 : 0.22})`,
      background: newListOpen ? 'rgb(var(--gold-rgb) / 0.04)' : 'transparent',
    }}>
      {newListOpen ? (
        <div style={{ padding: '1rem 1.25rem 1.1rem' }}>
          <input
            autoFocus value={newListTitle} onChange={e => setNewListTitle(e.target.value)}
            placeholder="Name your list (e.g. Shared Kitchen)" maxLength={80} style={{ ...fieldStyle, fontSize: '0.95rem' }}
          />
          <input
            value={newListDesc} onChange={e => setNewListDesc(e.target.value)}
            placeholder="What's it for? (optional)" maxLength={300}
            style={{ ...fieldStyle, fontSize: '0.82rem', border: '1px solid rgb(var(--gold-rgb) / 0.2)' }}
          />
          {dashCheckbox(newListDash, setNewListDash)}
          <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-end' }}>
            {pillBtn('Cancel', () => { setNewListOpen(false); setNewListTitle(''); setNewListDesc(''); setNewListDash(false) }, false, false)}
            {pillBtn(newListBusy ? 'Creating…' : 'Create list', submitNewList, newListBusy || !newListTitle.trim(), true)}
          </div>
        </div>
      ) : (
        <button
          onClick={() => { setNewListOpen(true); setNewListTitle(''); setNewListDesc(''); setNewListDash(false) }}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
            width: '100%', boxSizing: 'border-box', padding: '0.9rem 1.25rem', cursor: 'pointer',
            border: 'none', background: 'rgb(var(--gold-rgb) / 0.06)', color: 'var(--lemon)',
            fontSize: '0.85rem', letterSpacing: '0.05em', fontFamily: 'inherit',
          }}
        >
          <span aria-hidden style={{ color: GOLD, fontSize: '1rem' }}>＋</span> New list
        </button>
      )}
    </div>
  )

  // Empty state — inviting when the member can author, quiet otherwise.
  if (lists.length === 0) {
    return canManage ? (
      <div>
        {error && <p style={{ color: 'var(--danger)', fontSize: '0.8rem', marginBottom: '0.75rem' }}>{error}</p>}
        <p style={{ fontSize: '0.85rem', opacity: 0.55, margin: '0 0 1rem', lineHeight: 1.6 }}>
          No resource lists yet. Start one — a Shared Kitchen, Setup Gear, Decor — and add what the community will bring together.
        </p>
        {newListForm}
      </div>
    ) : (
      <p style={{ fontSize: '0.85rem', opacity: 0.45, fontStyle: 'italic' }}>
        Nothing needs bringing right now.
      </p>
    )
  }

  return (
    <div>
      {error && <p style={{ color: 'var(--danger)', fontSize: '0.8rem', marginBottom: '0.75rem' }}>{error}</p>}

      {pulseLine && (
        <p style={{ margin: '0 0 1.25rem', fontSize: '0.8rem', color: GOLD, opacity: 0.7, fontStyle: 'italic' }}>{pulseLine}</p>
      )}

      {/* ── Toolbar — start a list, or add anything to any list without
          hunting for the right card first. Two-up on desktop, stacked on
          narrow screens (media queries need a real <style>, not inline). ── */}
      <style dangerouslySetInnerHTML={{ __html: `
        .res-toolbar { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; margin-bottom: 1.75rem; }
        @media (max-width: 520px) { .res-toolbar { grid-template-columns: 1fr; }
          .res-toolbar > * { grid-column: 1 / -1 !important; } }
      ` }} />
      {canManage && (
        <div className="res-toolbar">
          {newListForm}
          <div style={{
            borderRadius: '0.85rem', overflow: 'hidden',
            border: `1px solid rgb(var(--gold-rgb) / ${openForm === TOP_FORM ? 0.35 : 0.22})`,
            background: openForm === TOP_FORM ? 'rgb(var(--gold-rgb) / 0.04)' : 'transparent',
            gridColumn: openForm === TOP_FORM ? '1 / -1' : 'auto',
          }}>
            {openForm === TOP_FORM ? (
              renderAddItemForm(true, '')
            ) : (
              <button
                onClick={() => openContribute(TOP_FORM)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                  width: '100%', height: '100%', boxSizing: 'border-box', padding: '0.9rem 1.25rem', cursor: 'pointer',
                  border: 'none', background: 'rgb(var(--gold-rgb) / 0.06)', color: 'var(--lemon)',
                  fontSize: '0.85rem', letterSpacing: '0.05em', fontFamily: 'inherit',
                }}
              >
                <span aria-hidden style={{ color: GOLD, fontSize: '1rem' }}>＋</span> Contribute something
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── I'M BRINGING — my commitments, pinned up top ── */}
      {myCommitments.length > 0 && (
        <div style={{
          marginBottom: '2rem', borderRadius: '0.85rem', overflow: 'hidden',
          border: '1px solid rgb(var(--purple-rgb) / 0.35)', background: 'rgb(var(--purple-rgb) / 0.05)',
        }}>
          <div style={{ padding: '0.8rem 1.25rem 0.6rem', borderBottom: '1px solid rgb(var(--purple-rgb) / 0.15)' }}>
            <p style={{ margin: 0, fontSize: '0.66rem', letterSpacing: '0.2em', textTransform: 'uppercase', color: PURPLE, opacity: 0.85 }}>
              I&rsquo;m Bringing
            </p>
          </div>
          <div style={{ padding: '0.5rem 1.25rem 0.75rem' }}>
            {myCommitments.map(({ item, listTitle, listId }) => (
              <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.4rem 0' }}>
                <span style={{ color: GREEN, flexShrink: 0 }}>✓</span>
                <p style={{ flex: 1, margin: 0, fontSize: '0.85rem', color: CREAM, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.name}{item.mine > 1 ? ` ×${item.mine}` : ''}
                  <span style={{ opacity: 0.4, fontSize: '0.75rem' }}> — {listTitle}</span>
                </p>
                <button
                  onClick={() => jumpToItem(item.id, listId)}
                  style={{ background: 'none', border: 'none', padding: 0, color: GOLD, opacity: 0.6, cursor: 'pointer', fontSize: '0.72rem', letterSpacing: '0.05em', fontFamily: 'inherit', flexShrink: 0 }}
                >
                  Edit ›
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {lists.map(renderList)}
      </div>
    </div>
  )
}
