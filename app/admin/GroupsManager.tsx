'use client'

import { useState, useEffect, useMemo } from 'react'
import { AssetImagePicker, type GroupIconOption } from './AssetImagePicker'
import { LoadError } from './LoadError'
import { useConfirm } from '../components/ConfirmDialog'

type Group = {
  id: string
  name: string
  description: string | null
  icon: string | null
  icon_image: string | null
  apply_selectable: boolean
  sort_order: number
  join_policy: string
  visibility: string
  collection_id: string | null
  member_count: number
  required_shift_type_id: string | null
  required_shift_hours: number | null
}

type ShiftTypeOption = { id: string; name: string }

type Collection = {
  id: string
  name: string
  description: string | null
  selection: 'single' | 'multi'
  show_on_profile: boolean
  self_join: boolean
  sort_order: number
}

type RosterMember = {
  clerk_user_id: string
  application_id: string | null
  source: string
  first_name: string | null
  last_name: string | null
  preferred_name: string | null
  email: string | null
  status: string | null
}

// Approved members available to assign, passed from the admin page.
export type AssignableMember = {
  clerk_user_id: string
  displayName: string
  email: string
}

type GroupForm = { name: string; description: string; icon: string; icon_image: string; join_policy: string; visibility: string; collection_id: string; required_shift_type_id: string; required_shift_hours: string }

const selectStyle: React.CSSProperties = {
  width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgb(var(--gold-rgb) / 0.2)',
  borderRadius: '0.5rem', padding: '0.55rem 0.85rem', color: 'var(--cream)', fontSize: '0.85rem',
  fontFamily: 'var(--font-libre-baskerville), Georgia, serif', outline: 'none', boxSizing: 'border-box',
}

const GOLD = 'var(--gold)'

const inputStyle: React.CSSProperties = {
  width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgb(var(--gold-rgb) / 0.2)',
  borderRadius: '0.5rem', padding: '0.6rem 0.85rem', color: 'var(--cream)', fontSize: '0.875rem',
  fontFamily: 'var(--font-libre-baskerville), Georgia, serif', outline: 'none', boxSizing: 'border-box',
}
const labelStyle: React.CSSProperties = {
  fontSize: '0.68rem', letterSpacing: '0.1em', textTransform: 'uppercase',
  color: GOLD, opacity: 0.65, display: 'block', marginBottom: '0.35rem',
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '1rem' }}>
      <label style={labelStyle}>{label}</label>
      {hint && <p style={{ fontSize: '0.72rem', opacity: 0.4, marginBottom: '0.4rem' }}>{hint}</p>}
      {children}
    </div>
  )
}

// ── Group Modal ───────────────────────────────────────────────────────────────

function GroupModal({
  initial, isNew, onSave, onClose, saving, error, groupId, collections, groupIconOptions, shiftTypes,
}: {
  initial: GroupForm
  isNew: boolean
  onSave: (f: GroupForm) => void
  onClose: () => void
  saving: boolean
  error: string | null
  groupId?: string
  collections: Collection[]
  groupIconOptions: GroupIconOption[]
  shiftTypes: ShiftTypeOption[]
}) {
  const [form, setForm] = useState(initial)
  const set = <K extends keyof GroupForm>(k: K, v: GroupForm[K]) => setForm(f => ({ ...f, [k]: v }))
  // Stable storage key for uploads: the row id when editing, else a fresh key so
  // an icon can be uploaded before the group is saved.
  const [uploadKey] = useState(() => groupId ?? (globalThis.crypto?.randomUUID?.() ?? `new-${Date.now()}`))

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 50 }} />
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 51, background: '#1a1410', border: '1px solid rgb(var(--gold-rgb) / 0.25)', borderRadius: '1rem', padding: '2rem', width: '90%', maxWidth: '480px', maxHeight: '90vh', overflowY: 'auto' }}>
        <p style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', color: GOLD, marginBottom: '1.5rem' }}>
          {isNew ? 'New Group' : 'Edit Group'}
        </p>
        <Field label="Name">
          <input style={inputStyle} value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Setup" maxLength={40} />
        </Field>
        <Field label="Collection" hint="The group collection this group belongs to.">
          <select style={selectStyle} value={form.collection_id} onChange={e => set('collection_id', e.target.value)}>
            {collections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Description (optional)">
          <textarea style={{ ...inputStyle, resize: 'vertical', minHeight: '72px' }} value={form.description} onChange={e => set('description', e.target.value)} placeholder="What is this group for? Shown to applicants when offered on the form." />
        </Field>
        <Field label="Emoji (optional)">
          <input style={inputStyle} value={form.icon} onChange={e => set('icon', e.target.value)} placeholder="e.g. ⚒️" />
        </Field>
        <Field label="Who can join" hint="Admin-assigned: only admins manage members. Open: members can join/leave themselves from the Messages → Find a group picker.">
          <select style={selectStyle} value={form.join_policy} onChange={e => set('join_policy', e.target.value)}>
            <option value="admin_assigned">Admin-assigned (admins manage membership)</option>
            <option value="open">Open (members can self-join &amp; leave)</option>
          </select>
        </Field>
        <Field label="Visibility" hint="Listed: open groups appear in the Find-a-group picker. Hidden: invite/admin-add only, not discoverable.">
          <select style={selectStyle} value={form.visibility} onChange={e => set('visibility', e.target.value)}>
            <option value="listed">Listed (discoverable)</option>
            <option value="hidden">Hidden (invite / admin-add only)</option>
          </select>
        </Field>
        <Field label="Shift requirement (optional)" hint="Members of this group owe this many hours of the chosen shift type. Attunement reflects it once they join. Leave as “None” for no requirement.">
          <select style={selectStyle} value={form.required_shift_type_id} onChange={e => set('required_shift_type_id', e.target.value)}>
            <option value="">None</option>
            {shiftTypes.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        {form.required_shift_type_id && (
          <Field label="Required hours">
            <input type="number" min="0.5" step="0.5" style={{ ...inputStyle, width: '120px' }} value={form.required_shift_hours} onChange={e => set('required_shift_hours', e.target.value)} placeholder="e.g. 3" />
          </Field>
        )}
        <Field label="Icon (optional)" hint="A patch-style image shown scattered on members' profiles. Choose an included image or upload your own.">
          <AssetImagePicker
            value={form.icon_image || undefined}
            onChange={v => set('icon_image', v ?? '')}
            uploadUrl={`/api/admin/groups/${encodeURIComponent(uploadKey)}/icon`}
            groupIconOptions={groupIconOptions}
            primaryCategory="icon"
            label="Group icon"
          />
        </Field>
        <p style={{ fontSize: '0.72rem', opacity: 0.4, lineHeight: 1.5, marginBottom: '1.25rem' }}>
          Whether members can self-join is set on the <strong style={{ opacity: 0.8 }}>collection</strong> (edit the collection to toggle Self-join). To let <em>applicants</em> opt in during the application, add a <strong style={{ opacity: 0.8 }}>Group selection</strong> field in the Application Builder.
        </p>
        {error && <p style={{ color: 'var(--danger)', fontSize: '0.82rem', marginBottom: '0.75rem' }}>{error}</p>}
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '0.6rem 1.2rem', borderRadius: '9999px', border: '1px solid rgb(var(--gold-rgb) / 0.2)', background: 'transparent', color: 'var(--cream)', cursor: 'pointer', fontSize: '0.82rem', opacity: 0.7 }}>Cancel</button>
          <button onClick={() => onSave(form)} disabled={saving || !form.name} style={{ padding: '0.6rem 1.2rem', borderRadius: '9999px', border: '1px solid rgb(var(--gold-rgb) / 0.45)', background: 'transparent', color: 'var(--lemon)', cursor: 'pointer', fontSize: '0.82rem', opacity: saving || !form.name ? 0.4 : 1 }}>
            {saving ? 'Saving…' : 'Save group'}
          </button>
        </div>
      </div>
    </>
  )
}

// ── Roster (member assignment) ─────────────────────────────────────────────────

function Roster({ groupId, members }: { groupId: string; members: AssignableMember[] }) {
  const [roster, setRoster] = useState<RosterMember[] | null>(null)
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetch(`/api/admin/groups/${groupId}/members`)
      .then(r => r.json())
      .then(d => setRoster(d.members ?? []))
      .catch(() => setRoster([]))
  }, [groupId])

  const inGroup = useMemo(() => new Set((roster ?? []).map(m => m.clerk_user_id)), [roster])

  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase()
    return members
      .filter(m => !inGroup.has(m.clerk_user_id))
      .filter(m => !q || m.displayName.toLowerCase().includes(q) || m.email.toLowerCase().includes(q))
      .slice(0, 8)
  }, [members, inGroup, query])

  async function add(m: AssignableMember) {
    setBusy(true)
    const res = await fetch(`/api/admin/groups/${groupId}/members`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clerk_user_id: m.clerk_user_id }),
    })
    if (res.ok) {
      setRoster(prev => [...(prev ?? []), {
        clerk_user_id: m.clerk_user_id, application_id: null, source: 'admin',
        first_name: m.displayName, last_name: null, preferred_name: null, email: m.email, status: 'approved',
      }])
      setQuery('')
    }
    setBusy(false)
  }

  async function remove(clerkId: string) {
    setBusy(true)
    const res = await fetch(`/api/admin/groups/${groupId}/members?clerk_user_id=${encodeURIComponent(clerkId)}`, { method: 'DELETE' })
    if (res.ok) setRoster(prev => (prev ?? []).filter(m => m.clerk_user_id !== clerkId))
    setBusy(false)
  }

  if (roster === null) return <p style={{ fontSize: '0.8rem', opacity: 0.4, padding: '0.5rem 0' }}>Loading roster…</p>

  return (
    <div>
      {roster.length === 0 ? (
        <p style={{ fontSize: '0.82rem', opacity: 0.35, fontStyle: 'italic', margin: '0 0 0.85rem' }}>No members yet.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginBottom: '0.85rem' }}>
          {roster.map(m => {
            const name = m.preferred_name || m.first_name || m.email || m.clerk_user_id
            return (
              <div key={m.clerk_user_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', padding: '0.5rem 0.75rem', borderRadius: '0.5rem', background: 'rgba(255,255,255,0.02)', border: '1px solid rgb(var(--gold-rgb) / 0.08)' }}>
                <div style={{ minWidth: 0 }}>
                  {m.application_id ? (
                    <a
                      href={`/admin/${m.application_id}`}
                      style={{ fontSize: '0.85rem', margin: 0, color: GOLD, opacity: 0.75, textDecoration: 'none', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    >
                      {name}
                    </a>
                  ) : (
                    <p style={{ fontSize: '0.85rem', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</p>
                  )}
                  {m.email && <p style={{ fontSize: '0.7rem', opacity: 0.4, margin: 0 }}>{m.email}</p>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                  {m.source === 'application' && <span style={{ fontSize: '0.6rem', color: GOLD, opacity: 0.55, border: '1px solid rgb(var(--gold-rgb) / 0.2)', borderRadius: '9999px', padding: '0.1rem 0.4rem' }} title="Opted in on their application">opted in</span>}
                  {m.status && m.status !== 'approved' && <span style={{ fontSize: '0.6rem', color: 'var(--amber)', opacity: 0.8 }}>{m.status}</span>}
                  <button onClick={() => remove(m.clerk_user_id)} disabled={busy} style={{ background: 'none', border: '1px solid rgba(255,80,80,0.2)', borderRadius: '0.4rem', color: 'var(--danger)', cursor: 'pointer', padding: '0.15rem 0.45rem', fontSize: '0.65rem', opacity: 0.7 }}>Remove</button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Add member */}
      <input
        style={{ ...inputStyle, fontSize: '0.82rem' }}
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Add a member — type a name or email…"
      />
      {query.trim() && (
        <div style={{ marginTop: '0.4rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          {candidates.length === 0 ? (
            <p style={{ fontSize: '0.75rem', opacity: 0.35, fontStyle: 'italic', padding: '0.25rem 0' }}>No matching approved members.</p>
          ) : candidates.map(m => (
            <button key={m.clerk_user_id} onClick={() => add(m)} disabled={busy} style={{ textAlign: 'left', background: 'rgb(var(--gold-rgb) / 0.04)', border: '1px solid rgb(var(--gold-rgb) / 0.12)', borderRadius: '0.4rem', color: 'var(--cream)', cursor: 'pointer', padding: '0.4rem 0.6rem', fontSize: '0.8rem' }}>
              + {m.displayName} <span style={{ opacity: 0.4 }}>· {m.email}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Group Row ───────────────────────────────────────────────────────────────

function GroupRow({
  group, members, isDragOver, onEdit, onDelete, onDragStart, onDragOver, onDrop, onDragEnd,
}: {
  group: Group
  members: AssignableMember[]
  isDragOver: boolean
  onEdit: () => void
  onDelete: () => void
  onDragStart: () => void
  onDragOver: (e: React.DragEvent) => void
  onDrop: () => void
  onDragEnd: () => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      style={{
        borderRadius: '0.75rem',
        border: isDragOver ? '1px solid rgb(var(--gold-rgb) / 0.5)' : '1px solid rgb(var(--gold-rgb) / 0.18)',
        background: isDragOver ? 'rgb(var(--gold-rgb) / 0.05)' : 'rgba(255,255,255,0.02)',
        transition: 'border-color 0.15s, background 0.15s', overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.9rem 1rem', cursor: 'grab', background: 'rgb(var(--gold-rgb) / 0.06)', borderBottom: open ? '1px solid rgb(var(--gold-rgb) / 0.12)' : 'none' }}>
        <span style={{ color: GOLD, opacity: 0.25, fontSize: '1rem', userSelect: 'none', flexShrink: 0 }}>⠿</span>
        {group.icon && <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>{group.icon}</span>}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: '0.92rem', color: 'var(--cream)', margin: 0, fontWeight: 600 }}>{group.name}</p>
          {group.description && (
            <p style={{ fontSize: '0.77rem', opacity: 0.45, margin: '0.15rem 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{group.description}</p>
          )}
        </div>
        {group.join_policy === 'open' && (
          <span title="Members can self-join" style={{ fontSize: '0.6rem', color: '#7fd1a0', opacity: 0.85, border: '1px solid rgba(127,209,160,0.3)', borderRadius: '9999px', padding: '0.1rem 0.45rem', flexShrink: 0, letterSpacing: '0.05em' }}>OPEN</span>
        )}
        {group.visibility === 'hidden' && (
          <span title="Not discoverable" style={{ fontSize: '0.6rem', color: GOLD, opacity: 0.5, border: '1px solid rgb(var(--gold-rgb) / 0.25)', borderRadius: '9999px', padding: '0.1rem 0.45rem', flexShrink: 0, letterSpacing: '0.05em' }}>HIDDEN</span>
        )}
        <span style={{ fontSize: '0.72rem', color: GOLD, opacity: 0.5, flexShrink: 0 }}>
          {group.member_count} member{group.member_count !== 1 ? 's' : ''}
        </span>
        <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0 }}>
          <button onClick={onEdit} style={{ background: 'none', border: '1px solid rgb(var(--gold-rgb) / 0.2)', borderRadius: '0.4rem', color: GOLD, cursor: 'pointer', padding: '0.25rem 0.5rem', fontSize: '0.7rem', opacity: 0.7 }}>Edit</button>
          <button onClick={onDelete} style={{ background: 'none', border: '1px solid rgba(255,80,80,0.2)', borderRadius: '0.4rem', color: 'var(--danger)', cursor: 'pointer', padding: '0.25rem 0.5rem', fontSize: '0.7rem', opacity: 0.7 }}>Del</button>
          <button onClick={() => setOpen(o => !o)} style={{ background: 'none', border: '1px solid rgb(var(--gold-rgb) / 0.15)', borderRadius: '0.4rem', color: GOLD, cursor: 'pointer', padding: '0.25rem 0.5rem', fontSize: '0.7rem', opacity: 0.5 }}>
            {open ? '▲' : '▼'}
          </button>
        </div>
      </div>

      {open && (
        <div style={{ padding: '0.85rem 1rem 1rem' }}>
          <Roster groupId={group.id} members={members} />
        </div>
      )}
    </div>
  )
}

// ── Collection Modal ──────────────────────────────────────────────────────────

type CollectionForm = { name: string; description: string; selection: 'single' | 'multi'; show_on_profile: boolean; self_join: boolean }

function CollectionModal({
  initial, isNew, onSave, onClose, saving, error,
}: {
  initial: CollectionForm
  isNew: boolean
  onSave: (f: CollectionForm) => void
  onClose: () => void
  saving: boolean
  error: string | null
}) {
  const [form, setForm] = useState(initial)

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 50 }} />
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 51, background: '#1a1410', border: '1px solid rgb(var(--gold-rgb) / 0.25)', borderRadius: '1rem', padding: '2rem', width: '90%', maxWidth: '480px' }}>
        <p style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', color: GOLD, marginBottom: '0.4rem' }}>
          {isNew ? 'New Group Collection' : 'Edit Group Collection'}
        </p>
        <p style={{ fontSize: '0.75rem', opacity: 0.45, lineHeight: 1.5, marginBottom: '1.5rem' }}>
          A collection is what you name the whole set (e.g. <em>Contributions</em>, <em>Volunteer Teams</em>, <em>Committees</em>). You add the selectable groups inside it.
        </p>
        <Field label="Name">
          <input style={inputStyle} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Contributions" maxLength={40} />
        </Field>
        <Field label="Description (optional)">
          <textarea style={{ ...inputStyle, resize: 'vertical', minHeight: '64px' }} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Shown to members where this collection appears." />
        </Field>
        <Field label="How many can a member choose?" hint="Multiple: members can belong to several groups here (e.g. Setup and Decor). One: exactly one (e.g. a cabin or a size).">
          <select style={selectStyle} value={form.selection} onChange={e => setForm(f => ({ ...f, selection: e.target.value as 'single' | 'multi' }))}>
            <option value="multi">Multiple groups</option>
            <option value="single">One group only</option>
          </select>
        </Field>
        <Field label="Visible on profile" hint="When on, a member's groups in this collection appear on their profile (/profile + public /members/[id]). Turn off for operational collections you don't want shown there. Display only — does not affect self-join.">
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer', fontSize: '0.85rem', color: 'var(--cream)' }}>
            <input type="checkbox" checked={form.show_on_profile} onChange={e => setForm(f => ({ ...f, show_on_profile: e.target.checked }))} style={{ width: 16, height: 16, accentColor: GOLD, cursor: 'pointer' }} />
            Visible on member profiles
          </label>
        </Field>
        <Field label="Self-join" hint="When on, members can join/leave this collection's groups themselves on the Participate page (/participate → Your Groups). Independent of profile visibility. Turn off for admin-assigned-only collections.">
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer', fontSize: '0.85rem', color: 'var(--cream)' }}>
            <input type="checkbox" checked={form.self_join} onChange={e => setForm(f => ({ ...f, self_join: e.target.checked }))} style={{ width: 16, height: 16, accentColor: GOLD, cursor: 'pointer' }} />
            Members can self-join on Participate
          </label>
        </Field>
        {error && <p style={{ color: 'var(--danger)', fontSize: '0.82rem', marginBottom: '0.75rem' }}>{error}</p>}
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '0.6rem 1.2rem', borderRadius: '9999px', border: '1px solid rgb(var(--gold-rgb) / 0.2)', background: 'transparent', color: 'var(--cream)', cursor: 'pointer', fontSize: '0.82rem', opacity: 0.7 }}>Cancel</button>
          <button onClick={() => onSave(form)} disabled={saving || !form.name} style={{ padding: '0.6rem 1.2rem', borderRadius: '9999px', border: '1px solid rgb(var(--gold-rgb) / 0.45)', background: 'transparent', color: 'var(--lemon)', cursor: 'pointer', fontSize: '0.82rem', opacity: saving || !form.name ? 0.4 : 1 }}>
            {saving ? 'Saving…' : 'Save collection'}
          </button>
        </div>
      </div>
    </>
  )
}

// ── Main ────────────────────────────────────────────────────────────────────

// ── Collection Section (a collection header + its nested group rows) ──────────

function CollectionSection({
  collection, groups, members, onAddGroup, onEditGroup, onDeleteGroup, onEditCollection, onDeleteCollection, onReorder,
}: {
  collection: Collection
  groups: Group[]
  members: AssignableMember[]
  onAddGroup: () => void
  onEditGroup: (g: Group) => void
  onDeleteGroup: (id: string) => void
  onEditCollection: () => void
  onDeleteCollection: () => void
  onReorder: (orderedIds: string[]) => void
}) {
  const [dragId, setDragId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const reset = () => { setDragId(null); setDragOverId(null) }

  function handleDrop(targetId: string) {
    if (!dragId || dragId === targetId) return reset()
    const ids = groups.map(g => g.id)
    const from = ids.indexOf(dragId)
    const to = ids.indexOf(targetId)
    if (from === -1 || to === -1) return reset()
    const reordered = [...groups]
    const [moved] = reordered.splice(from, 1)
    reordered.splice(to, 0, moved)
    onReorder(reordered.map(g => g.id))
    reset()
  }

  return (
    <div style={{ border: '1px solid rgb(var(--gold-rgb) / 0.15)', borderRadius: '1rem', padding: '1rem 1.1rem 1.2rem', background: 'rgb(var(--gold-rgb) / 0.02)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.65rem', marginBottom: '0.9rem' }}>
        <p style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', color: GOLD, margin: 0 }}>{collection.name}</p>
        <span style={{ fontSize: '0.6rem', color: GOLD, opacity: 0.55, border: '1px solid rgb(var(--gold-rgb) / 0.25)', borderRadius: '9999px', padding: '0.1rem 0.45rem', letterSpacing: '0.05em' }}>
          {collection.selection === 'single' ? 'PICK ONE' : 'PICK MANY'}
        </span>
        {!collection.show_on_profile && (
          <span title="Members' groups here are hidden from their profile" style={{ fontSize: '0.6rem', color: GOLD, opacity: 0.5, border: '1px solid rgb(var(--gold-rgb) / 0.25)', borderRadius: '9999px', padding: '0.1rem 0.45rem', letterSpacing: '0.05em' }}>
            OFF PROFILE
          </span>
        )}
        {collection.self_join && (
          <span title="Members can self-join these groups on the Participate page" style={{ fontSize: '0.6rem', color: 'var(--purple)', opacity: 0.7, border: '1px solid rgb(var(--purple-rgb) / 0.35)', borderRadius: '9999px', padding: '0.1rem 0.45rem', letterSpacing: '0.05em' }}>
            SELF-JOIN
          </span>
        )}
        <span style={{ fontSize: '0.72rem', opacity: 0.4 }}>{groups.length} group{groups.length !== 1 ? 's' : ''}</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.4rem' }}>
          <button onClick={onEditCollection} style={{ background: 'none', border: '1px solid rgb(var(--gold-rgb) / 0.2)', borderRadius: '0.4rem', color: GOLD, cursor: 'pointer', padding: '0.25rem 0.5rem', fontSize: '0.7rem', opacity: 0.7 }}>Edit</button>
          <button onClick={onDeleteCollection} style={{ background: 'none', border: '1px solid rgba(255,80,80,0.2)', borderRadius: '0.4rem', color: 'var(--danger)', cursor: 'pointer', padding: '0.25rem 0.5rem', fontSize: '0.7rem', opacity: 0.7 }}>Del</button>
        </div>
      </div>
      {collection.description && (
        <p style={{ fontSize: '0.77rem', opacity: 0.45, margin: '-0.4rem 0 0.9rem' }}>{collection.description}</p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginBottom: '0.9rem' }}>
        {groups.length === 0 ? (
          <p style={{ fontSize: '0.8rem', opacity: 0.35, fontStyle: 'italic' }}>No groups yet. Add the selectable options for this collection.</p>
        ) : groups.map(group => (
          <GroupRow
            key={group.id}
            group={group}
            members={members}
            isDragOver={dragOverId === group.id}
            onEdit={() => onEditGroup(group)}
            onDelete={() => onDeleteGroup(group.id)}
            onDragStart={() => setDragId(group.id)}
            onDragOver={(e) => { e.preventDefault(); setDragOverId(group.id) }}
            onDrop={() => handleDrop(group.id)}
            onDragEnd={reset}
          />
        ))}
      </div>

      <button onClick={onAddGroup} style={{ padding: '0.45rem 1.1rem', borderRadius: '9999px', border: '1px solid rgb(var(--gold-rgb) / 0.25)', background: 'transparent', color: 'var(--lemon)', cursor: 'pointer', fontSize: '0.78rem', letterSpacing: '0.03em', opacity: 0.85 }}>
        + Add group to {collection.name}
      </button>
    </div>
  )
}

export function GroupsManager({ members }: { members: AssignableMember[] }) {
  const [groups, setGroups] = useState<Group[]>([])
  const [collections, setCollections] = useState<Collection[]>([])
  const [shiftTypes, setShiftTypes] = useState<ShiftTypeOption[]>([])
  const [loading, setLoading] = useState(true)

  // Group create/edit. `creatingIn` holds the collection id a new group lands in.
  const [editing, setEditing] = useState<Group | null>(null)
  const [creatingIn, setCreatingIn] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Collection create/edit.
  const [editingCol, setEditingCol] = useState<Collection | null>(null)
  const [creatingCol, setCreatingCol] = useState(false)
  const [savingCol, setSavingCol] = useState(false)
  const [colError, setColError] = useState<string | null>(null)
  const [loadError, setLoadError] = useState(false)
  const { confirm, confirmDialog } = useConfirm()

  const load = () => {
    setLoadError(false)
    const getJson = (url: string) => fetch(url).then(r => { if (!r.ok) throw new Error(); return r.json() })
    Promise.all([
      getJson('/api/admin/groups'),
      getJson('/api/admin/group-collections'),
      getJson('/api/admin/shift-types'),
    ])
      .then(([g, c, s]) => { setGroups(g.groups ?? []); setCollections(c.collections ?? []); setShiftTypes(s.shiftTypes ?? []) })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  // ── Groups ────────────────────────────────────────────────────────────────
  async function handleCreate(form: GroupForm) {
    setSaving(true); setError(null)
    const res = await fetch('/api/admin/groups', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, sort_order: groups.length }) })
    const data = await res.json()
    if (!res.ok) { setError(data.error); setSaving(false); return }
    setGroups(prev => [...prev, data.group])
    setCreatingIn(null); setSaving(false)
  }

  async function handleUpdate(group: Group, form: GroupForm) {
    setSaving(true); setError(null)
    const res = await fetch(`/api/admin/groups/${group.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
    const data = await res.json()
    if (!res.ok) { setError(data.error); setSaving(false); return }
    setGroups(prev => prev.map(g => g.id === group.id ? { ...g, ...data.group } : g))
    setEditing(null); setSaving(false)
  }

  async function handleDelete(id: string) {
    const group = groups.find(g => g.id === id)
    const ok = await confirm({
      title: `Delete ${group ? `“${group.name}”` : 'this group'}?`,
      body: 'All member assignments for it will be removed. This cannot be undone.',
      confirmLabel: 'Delete group',
      danger: true,
    })
    if (!ok) return
    const res = await fetch(`/api/admin/groups/${id}`, { method: 'DELETE' })
    if (res.ok) setGroups(prev => prev.filter(g => g.id !== id))
  }

  // Reorder within a collection, preserving that collection's pool of sort_order
  // values so global ordering elsewhere stays stable.
  function handleReorder(collectionId: string, orderedIds: string[]) {
    const inCol = groups.filter(g => g.collection_id === collectionId).sort((a, b) => a.sort_order - b.sort_order)
    const pool = inCol.map(g => g.sort_order)
    const orderMap = new Map(orderedIds.map((id, i) => [id, pool[i]]))
    setGroups(prev => prev.map(g => orderMap.has(g.id) ? { ...g, sort_order: orderMap.get(g.id)! } : g))
    orderMap.forEach((sort, id) => fetch(`/api/admin/groups/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sort_order: sort }) }))
  }

  // ── Collections ─────────────────────────────────────────────────────────────
  async function handleCreateCol(form: CollectionForm) {
    setSavingCol(true); setColError(null)
    const res = await fetch('/api/admin/group-collections', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, sort_order: collections.length }) })
    const data = await res.json()
    if (!res.ok) { setColError(data.error); setSavingCol(false); return }
    setCollections(prev => [...prev, data.collection])
    setCreatingCol(false); setSavingCol(false)
  }

  async function handleUpdateCol(col: Collection, form: CollectionForm) {
    setSavingCol(true); setColError(null)
    const res = await fetch(`/api/admin/group-collections/${col.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
    const data = await res.json()
    if (!res.ok) { setColError(data.error); setSavingCol(false); return }
    setCollections(prev => prev.map(c => c.id === col.id ? { ...c, ...data.collection } : c))
    setEditingCol(null); setSavingCol(false)
  }

  async function handleDeleteCol(id: string) {
    const col = collections.find(c => c.id === id)
    const name = col ? `“${col.name}”` : 'this collection'
    // A collection must be emptied before it can go — say so up front instead
    // of letting the delete bounce off the server.
    const remaining = groups.filter(g => g.collection_id === id).length
    if (remaining > 0) {
      await confirm({
        title: `${name} isn’t empty yet`,
        body: `It still holds ${remaining === 1 ? 'one group' : `${remaining} groups`} — move or delete ${remaining === 1 ? 'it' : 'them'} first.`,
        notice: true,
      })
      return
    }
    const ok = await confirm({
      title: `Delete ${name}?`,
      body: 'The collection and its settings will be removed.',
      confirmLabel: 'Delete collection',
      danger: true,
    })
    if (!ok) return
    const res = await fetch(`/api/admin/group-collections/${id}`, { method: 'DELETE' })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      await confirm({ title: 'Could not delete the collection', body: data.error ?? 'Something went wrong — try again in a moment.', notice: true })
      return
    }
    setCollections(prev => prev.filter(c => c.id !== id))
  }

  if (loading) return <p style={{ opacity: 0.4, fontSize: '0.85rem' }}>Loading…</p>
  if (loadError) return <LoadError onRetry={() => { setLoading(true); load() }} />

  const sortedCollections = [...collections].sort((a, b) => a.sort_order - b.sort_order)
  const groupsFor = (cid: string) => groups.filter(g => g.collection_id === cid).sort((a, b) => a.sort_order - b.sort_order)
  const uncollected = groups.filter(g => !g.collection_id).sort((a, b) => a.sort_order - b.sort_order)
  const firstCollectionId = sortedCollections[0]?.id ?? ''
  // Existing group icons offered as reusable options in the picker's Icons tab.
  const groupIconOptions: GroupIconOption[] = groups
    .filter(g => g.icon_image)
    .map(g => ({ name: g.name, image: g.icon_image as string }))

  return (
    <div>
      {collections.length === 0 && (
        <p style={{ opacity: 0.4, fontSize: '0.85rem', fontStyle: 'italic', marginBottom: '1.5rem' }}>
          No group collections yet. Create one (e.g. “Contributions”) to start adding groups.
        </p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem', marginBottom: '1.5rem' }}>
        {sortedCollections.map(col => (
          <CollectionSection
            key={col.id}
            collection={col}
            groups={groupsFor(col.id)}
            members={members}
            onAddGroup={() => { setCreatingIn(col.id); setError(null) }}
            onEditGroup={(g) => { setEditing(g); setError(null) }}
            onDeleteGroup={handleDelete}
            onEditCollection={() => { setEditingCol(col); setColError(null) }}
            onDeleteCollection={() => handleDeleteCol(col.id)}
            onReorder={(ids) => handleReorder(col.id, ids)}
          />
        ))}

        {uncollected.length > 0 && (
          <div style={{ border: '1px dashed rgba(255,140,140,0.25)', borderRadius: '1rem', padding: '1rem 1.1rem 1.2rem' }}>
            <p style={{ fontSize: '0.82rem', color: '#ffb0b0', opacity: 0.8, margin: '0 0 0.85rem' }}>
              Ungrouped — these groups have no collection. Edit each to assign one.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              {uncollected.map(group => (
                <GroupRow
                  key={group.id}
                  group={group}
                  members={members}
                  isDragOver={false}
                  onEdit={() => { setEditing(group); setError(null) }}
                  onDelete={() => handleDelete(group.id)}
                  onDragStart={() => {}}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {}}
                  onDragEnd={() => {}}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      <button onClick={() => { setCreatingCol(true); setColError(null) }} style={{ padding: '0.6rem 1.4rem', borderRadius: '9999px', border: '1px solid rgb(var(--gold-rgb) / 0.3)', background: 'transparent', color: 'var(--lemon)', cursor: 'pointer', fontSize: '0.82rem', letterSpacing: '0.05em' }}>
        + New Group Collection
      </button>

      {/* Group modals */}
      {creatingIn !== null && <GroupModal
        isNew
        collections={sortedCollections}
        groupIconOptions={groupIconOptions}
        shiftTypes={shiftTypes}
        initial={{ name: '', description: '', icon: '', icon_image: '', join_policy: 'admin_assigned', visibility: 'listed', collection_id: creatingIn || firstCollectionId, required_shift_type_id: '', required_shift_hours: '' }}
        onSave={handleCreate}
        onClose={() => setCreatingIn(null)}
        saving={saving}
        error={error}
      />}
      {editing && <GroupModal
        isNew={false}
        collections={sortedCollections}
        groupIconOptions={groupIconOptions}
        shiftTypes={shiftTypes}
        initial={{ name: editing.name, description: editing.description ?? '', icon: editing.icon ?? '', icon_image: editing.icon_image ?? '', join_policy: editing.join_policy ?? 'admin_assigned', visibility: editing.visibility ?? 'listed', collection_id: editing.collection_id ?? firstCollectionId, required_shift_type_id: editing.required_shift_type_id ?? '', required_shift_hours: editing.required_shift_hours != null ? String(editing.required_shift_hours) : '' }}
        onSave={(f) => handleUpdate(editing, f)}
        onClose={() => setEditing(null)}
        saving={saving}
        error={error}
        groupId={editing.id}
      />}

      {/* Collection modals */}
      {creatingCol && <CollectionModal
        isNew
        initial={{ name: '', description: '', selection: 'multi', show_on_profile: true, self_join: false }}
        onSave={handleCreateCol}
        onClose={() => setCreatingCol(false)}
        saving={savingCol}
        error={colError}
      />}
      {editingCol && <CollectionModal
        isNew={false}
        initial={{ name: editingCol.name, description: editingCol.description ?? '', selection: editingCol.selection, show_on_profile: editingCol.show_on_profile, self_join: editingCol.self_join }}
        onSave={(f) => handleUpdateCol(editingCol, f)}
        onClose={() => setEditingCol(null)}
        saving={savingCol}
        error={colError}
      />}

      {confirmDialog}
    </div>
  )
}
