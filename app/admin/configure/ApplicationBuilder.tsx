'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import type { MemberFormConfig, VolunteerFormConfig, StepConfig, FieldConfig } from '@/lib/form-config'
import { mergeMemberConfig } from '@/lib/form-config'
import { parseProfileFields, applicationFields } from '@/lib/profile-fields'
import { DEFAULT_TRACK_COPY, type TrackCopy } from '@/lib/site-config'
import { AdminNav } from '../AdminNav'
import { useConfirm } from '../../components/ConfirmDialog'

// ── Colors ────────────────────────────────────────────────────────────────────

const INK    = 'var(--ink)'
const GOLD   = 'var(--gold)'
const PURPLE = 'var(--purple)'
const CREAM  = 'var(--cream)'
const LAVENDER = 'var(--lavender)'

// Section numerals shown in the builder — mirror the applicant-facing wizard,
// which numbers visible sections by position (ApplyWizard ROMAN).
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']

// Built-in steps whose fields are rendered by the config-driven ModularSection
// on the live form (all of them). Keep in sync with ApplyWizard.tsx.
const MODULAR_STEP_KEYS = ['basic', 'registry', 'plans', 'roles', 'agreement', 'shrimp']

// ── Toggle ────────────────────────────────────────────────────────────────────

function Toggle({ checked, disabled, onChange, color = GOLD }: {
  checked: boolean; disabled?: boolean; onChange: () => void; color?: string
}) {
  return (
    <button
      onClick={onChange}
      disabled={disabled}
      aria-pressed={checked}
      style={{
        width: '36px', height: '20px', borderRadius: '9999px', flexShrink: 0,
        border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
        background: checked ? color : 'rgba(255,255,255,0.12)',
        transition: 'background 0.2s', position: 'relative',
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <div style={{
        position: 'absolute', top: '2px',
        left: checked ? '18px' : '2px',
        width: '16px', height: '16px', borderRadius: '50%',
        background: checked ? INK : 'rgba(255,255,255,0.5)',
        transition: 'left 0.2s',
      }} />
    </button>
  )
}

// ── Eye toggle button ─────────────────────────────────────────────────────────

function EyeBtn({ visible, disabled, onChange }: { visible: boolean; disabled?: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      disabled={disabled}
      title={disabled ? 'This field cannot be hidden' : visible ? 'Hide' : 'Show'}
      style={{
        background: 'none', border: 'none', cursor: disabled ? 'default' : 'pointer',
        padding: '0.2rem', flexShrink: 0,
        opacity: disabled ? 0.2 : visible ? 0.8 : 0.35,
        color: visible ? GOLD : CREAM,
      }}
    >
      {visible ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
          <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
          <line x1="1" y1="1" x2="23" y2="23" />
        </svg>
      )}
    </button>
  )
}

// ── Field row ─────────────────────────────────────────────────────────────────

const FIELD_TYPE_LABELS: Record<string, string> = {
  text: 'Short text', textarea: 'Long text', radio: 'Single choice', checkbox: 'Multiple choice', file: 'File upload', agreement: 'Agreement', group_select: 'Group selection',
}

// Layout element row (divider / paragraph) — editable caption/text, reorder,
// show-hide, and delete (custom only).
function ElementRow({
  field, saving, onLabelChange, onDescChange, onToggleVisible,
  onMoveUp, onMoveDown, isFirst, isLast, onDelete,
}: {
  field: FieldConfig
  saving: boolean
  onLabelChange: (v: string) => void
  onDescChange: (v: string) => void
  onToggleVisible: () => void
  onMoveUp?: () => void
  onMoveDown?: () => void
  isFirst?: boolean
  isLast?: boolean
  onDelete?: () => void
}) {
  const isDivider = field.element === 'divider'
  return (
    <div style={{
      borderRadius: '0.5rem',
      background: 'rgb(var(--purple-rgb) / 0.04)',
      border: '1px dashed rgb(var(--purple-rgb) / 0.2)',
      opacity: field.visible ? 1 : 0.4,
      display: 'flex', alignItems: 'flex-start', gap: '0.75rem', padding: '0.55rem 0.85rem',
    }}>
      <span style={{ fontSize: '0.55rem', letterSpacing: '0.12em', color: PURPLE, opacity: 0.7, fontWeight: 700, flexShrink: 0, marginTop: '0.35rem', width: '4.5rem' }}>
        {isDivider ? 'DIVIDER' : 'TEXT'}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        {isDivider ? (
          <input
            value={field.label}
            onChange={e => onLabelChange(e.target.value)}
            placeholder="Optional caption (blank = plain line)"
            style={{ width: '100%', boxSizing: 'border-box', background: 'transparent', border: 'none', borderBottom: '1px solid rgb(var(--purple-rgb) / 0.2)', color: CREAM, fontSize: '0.8rem', outline: 'none', padding: '0.1rem 0', fontFamily: 'inherit' }}
          />
        ) : (
          <>
            <textarea
              value={field.description ?? ''}
              onChange={e => onDescChange(e.target.value)}
              placeholder="Text shown to applicants…"
              rows={5}
              style={{ width: '100%', boxSizing: 'border-box', background: 'rgba(0,0,0,0.15)', border: '1px solid rgb(var(--purple-rgb) / 0.15)', borderRadius: '0.4rem', color: CREAM, fontSize: '0.8rem', outline: 'none', padding: '0.5rem 0.6rem', fontFamily: 'inherit', lineHeight: 1.6, resize: 'vertical' }}
            />
            <p style={{ fontSize: '0.62rem', opacity: 0.4, margin: '0.35rem 0 0', lineHeight: 1.5 }}>
              Blank line = new paragraph · lines starting with <code>*</code> or <code>✦</code> = bullets · <code>[text](url)</code> or a bare link = clickable · <code>**bold**</code>
            </p>
          </>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}>
        <EyeBtn visible={field.visible} disabled={saving} onChange={onToggleVisible} />
        {onMoveUp && onMoveDown && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.1rem' }}>
            <button onClick={onMoveUp} disabled={isFirst || saving} title="Move up" style={{ background: 'none', border: 'none', cursor: isFirst ? 'default' : 'pointer', color: CREAM, opacity: isFirst ? 0.15 : 0.45, padding: '0.1rem', fontSize: '0.7rem' }}>↑</button>
            <button onClick={onMoveDown} disabled={isLast || saving} title="Move down" style={{ background: 'none', border: 'none', cursor: isLast ? 'default' : 'pointer', color: CREAM, opacity: isLast ? 0.15 : 0.45, padding: '0.1rem', fontSize: '0.7rem' }}>↓</button>
          </div>
        )}
        {onDelete && (
          <button onClick={onDelete} disabled={saving} title="Delete" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', opacity: 0.5, padding: '0.1rem', fontSize: '0.85rem', lineHeight: 1 }}>✕</button>
        )}
      </div>
    </div>
  )
}

function FieldRow({
  field, saving,
  onToggleVisible, onToggleRequired, onLabelChange, onDescChange,
  onOptionsChange, onDelete,
  onMoveUp, onMoveDown, isFirst, isLast, onToggleWidth, groups = [],
  profileFieldOptions, onBindProfileField,
}: {
  field: FieldConfig
  saving: boolean
  onToggleVisible: () => void
  onToggleRequired: () => void
  onLabelChange: (v: string) => void
  onDescChange: (v: string) => void
  onOptionsChange?: (opts: string[]) => void
  onDelete?: () => void
  // Reorder + width controls (provided only for modular sections)
  onMoveUp?: () => void
  onMoveDown?: () => void
  isFirst?: boolean
  isLast?: boolean
  onToggleWidth?: () => void
  groups?: { id: string; name: string }[]
  // Registry fields this custom field may save its answer into (Phase 3).
  profileFieldOptions?: { key: string; label: string }[]
  onBindProfileField?: (key: string | undefined) => void
}) {
  const showOptions = (field.isCustom && (field.type === 'radio' || field.type === 'checkbox')) || field.type === 'agreement'
  const isAgreement = field.type === 'agreement'
  const isHalf = (field.width ?? 'full') === 'half'

  // Locked core field — always present, not deletable/hideable/reorderable here.
  // Its Required status is editable only when canChangeRequired (e.g. Photo).
  if (field.locked) {
    return (
      <div style={{
        borderRadius: '0.5rem',
        background: 'rgb(var(--gold-rgb) / 0.04)',
        border: '1px solid rgb(var(--gold-rgb) / 0.12)',
        display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.65rem 0.85rem',
      }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, opacity: 0.55 }}>
          <rect x="3" y="11" width="18" height="11" rx="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ color: CREAM, fontSize: '0.85rem', opacity: 0.9 }}>{field.label}</span>
          {field.description && (
            <p style={{ fontSize: '0.72rem', opacity: 0.4, margin: '0.1rem 0 0', fontStyle: 'italic' }}>{field.description}</p>
          )}
        </div>
        <span style={{ fontSize: '0.6rem', letterSpacing: '0.12em', color: GOLD, opacity: 0.5, fontWeight: 700, flexShrink: 0 }}>CORE</span>
        {field.canChangeRequired ? (
          <button
            onClick={onToggleRequired}
            disabled={saving}
            style={{
              flexShrink: 0,
              padding: '0.2rem 0.55rem', borderRadius: '9999px',
              fontSize: '0.65rem', letterSpacing: '0.08em',
              border: `1px solid ${field.required ? 'rgb(var(--danger-rgb) / 0.4)' : 'rgb(var(--gold-rgb) / 0.2)'}`,
              color: field.required ? 'var(--danger)' : CREAM,
              background: field.required ? 'rgb(var(--danger-rgb) / 0.08)' : 'transparent',
              cursor: saving ? 'not-allowed' : 'pointer', transition: 'all 0.15s',
            }}
          >
            {field.required ? 'REQUIRED' : 'OPTIONAL'}
          </button>
        ) : (
          <span style={{ flexShrink: 0, padding: '0.2rem 0.55rem', borderRadius: '9999px', fontSize: '0.65rem', letterSpacing: '0.08em', border: '1px solid rgb(var(--danger-rgb) / 0.2)', color: 'var(--danger)', opacity: 0.5 }}>REQUIRED</span>
        )}
      </div>
    )
  }

  return (
    <div style={{
      borderRadius: '0.5rem',
      background: field.visible ? 'rgb(var(--gold-rgb) / 0.03)' : 'rgba(0,0,0,0.15)',
      border: '1px solid rgb(var(--gold-rgb) / 0.08)',
      opacity: field.visible ? 1 : 0.45,
      transition: 'opacity 0.2s',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', padding: '0.65rem 0.85rem' }}>
        <EyeBtn visible={field.visible} disabled={saving} onChange={onToggleVisible} />

        <div style={{ flex: 1, minWidth: 0 }}>
          <input
            value={field.label}
            onChange={e => onLabelChange(e.target.value)}
            style={{
              width: '100%', boxSizing: 'border-box',
              background: 'transparent', border: 'none', borderBottom: '1px solid transparent',
              color: CREAM, fontSize: '0.85rem', outline: 'none', padding: '0 0 0.1rem',
              fontFamily: 'inherit',
            }}
            onFocus={e => { e.currentTarget.style.borderBottomColor = 'rgb(var(--purple-rgb) / 0.4)' }}
            onBlur={e => { e.currentTarget.style.borderBottomColor = 'transparent' }}
          />
          <input
            value={field.description ?? ''}
            onChange={e => onDescChange(e.target.value)}
            placeholder="Add description…"
            style={{
              width: '100%', boxSizing: 'border-box',
              background: 'transparent', border: 'none', borderBottom: '1px solid transparent',
              color: CREAM, fontSize: '0.72rem', outline: 'none', padding: '0.1rem 0',
              opacity: 0.45, fontFamily: 'inherit', fontStyle: 'italic',
            }}
            onFocus={e => { e.currentTarget.style.borderBottomColor = 'rgb(var(--purple-rgb) / 0.3)' }}
            onBlur={e => { e.currentTarget.style.borderBottomColor = 'transparent' }}
          />
          {field.isCustom && (
            <span style={{ display: 'inline-block', marginTop: '0.35rem', fontSize: '0.6rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: PURPLE, opacity: 0.5, fontWeight: 700 }}>
              {FIELD_TYPE_LABELS[field.type ?? 'text'] ?? 'Field'}
            </span>
          )}
          {/* Phase 3: bind a custom field's answer to a canonical profile field. */}
          {field.isCustom && field.type !== 'group_select' && onBindProfileField && (profileFieldOptions?.length ?? 0) > 0 && (() => {
            // A binding can dangle: if the linked profile field was deleted (or
            // deleted-and-recreated, which mints a new key), answers keep being
            // written to a key nothing displays. Surface that instead of letting
            // the <select> silently render as unbound.
            const dangling = !!field.profileFieldKey && !profileFieldOptions!.some(o => o.key === field.profileFieldKey)
            return (
            <div style={{ marginTop: '0.4rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span style={{ fontSize: '0.58rem', letterSpacing: '0.08em', textTransform: 'uppercase', opacity: 0.4 }}>Saves to</span>
                <select
                  value={field.profileFieldKey ?? ''}
                  onChange={e => onBindProfileField(e.target.value || undefined)}
                  title="Save this answer to a member profile field (reusable across forms; usable in distinctions)"
                  style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${dangling ? 'rgba(255,180,50,0.5)' : 'rgb(var(--gold-rgb) / 0.2)'}`, borderRadius: '0.3rem', color: dangling ? 'var(--amber)' : CREAM, fontSize: '0.7rem', padding: '0.15rem 0.35rem', fontFamily: 'inherit', outline: 'none' }}
                >
                  <option value="" style={{ background: INK }}>This application only</option>
                  {dangling && (
                    <option value={field.profileFieldKey} style={{ background: INK }}>⚠ missing field: {field.profileFieldKey}</option>
                  )}
                  {profileFieldOptions!.map(o => (
                    <option key={o.key} value={o.key} style={{ background: INK }}>{o.label}</option>
                  ))}
                </select>
              </div>
              {dangling && (
                <p style={{ margin: '0.3rem 0 0', fontSize: '0.66rem', color: 'var(--amber)', opacity: 0.85, lineHeight: 1.5 }}>
                  This answer saves to a profile field that no longer exists, so it shows up nowhere.
                  Pick a current profile field (or &ldquo;This application only&rdquo;) to fix it.
                </p>
              )}
            </div>
            )
          })()}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
          {onToggleWidth && (
            <button
              onClick={onToggleWidth}
              disabled={saving}
              title={isHalf ? 'Half width — click for full width' : 'Full width — click for half width'}
              style={{
                padding: '0.2rem 0.5rem', borderRadius: '0.4rem',
                fontSize: '0.62rem', letterSpacing: '0.06em', fontWeight: 700,
                border: `1px solid ${isHalf ? 'rgb(var(--purple-rgb) / 0.4)' : 'rgb(var(--gold-rgb) / 0.2)'}`,
                color: isHalf ? PURPLE : CREAM,
                background: isHalf ? 'rgb(var(--purple-rgb) / 0.08)' : 'transparent',
                cursor: saving ? 'not-allowed' : 'pointer', opacity: isHalf ? 1 : 0.55,
              }}
            >{isHalf ? '½' : '▭'}</button>
          )}
          {onMoveUp && onMoveDown && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.1rem' }}>
              <button
                onClick={onMoveUp}
                disabled={isFirst || saving}
                title="Move up"
                style={{ background: 'none', border: 'none', cursor: isFirst ? 'default' : 'pointer', color: CREAM, opacity: isFirst ? 0.15 : 0.45, padding: '0.1rem', fontSize: '0.7rem' }}
              >↑</button>
              <button
                onClick={onMoveDown}
                disabled={isLast || saving}
                title="Move down"
                style={{ background: 'none', border: 'none', cursor: isLast ? 'default' : 'pointer', color: CREAM, opacity: isLast ? 0.15 : 0.45, padding: '0.1rem', fontSize: '0.7rem' }}
              >↓</button>
            </div>
          )}
          <button
            onClick={onToggleRequired}
            disabled={saving}
            style={{
              padding: '0.2rem 0.55rem', borderRadius: '9999px',
              fontSize: '0.65rem', letterSpacing: '0.08em',
              border: `1px solid ${field.required ? 'rgb(var(--danger-rgb) / 0.4)' : 'rgb(var(--gold-rgb) / 0.2)'}`,
              color: field.required ? 'var(--danger)' : CREAM,
              background: field.required ? 'rgb(var(--danger-rgb) / 0.08)' : 'transparent',
              cursor: saving ? 'not-allowed' : 'pointer', transition: 'all 0.15s',
            }}
          >
            {field.required ? 'REQUIRED' : 'OPTIONAL'}
          </button>
          {onDelete && (
            <button
              onClick={onDelete}
              disabled={saving}
              title="Delete field"
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--danger)', opacity: 0.5, padding: '0.1rem',
                fontSize: '0.85rem', lineHeight: 1,
              }}
            >✕</button>
          )}
        </div>
      </div>

      {/* Options editor for radio/checkbox custom fields */}
      {showOptions && onOptionsChange && (
        <div style={{ padding: '0 0.85rem 0.75rem 2.5rem', display: 'flex', flexDirection: 'column', gap: isAgreement ? '0.45rem' : '0.3rem' }}>
          {(field.options ?? []).map((opt, i) => (
            <div key={i} style={{ display: 'flex', alignItems: isAgreement ? 'flex-start' : 'center', gap: '0.4rem' }}>
              <span style={{ color: GOLD, opacity: 0.4, fontSize: '0.7rem', marginTop: isAgreement ? '0.4rem' : 0 }}>{isAgreement ? '☐' : '○'}</span>
              {isAgreement ? (
                <textarea
                  value={opt}
                  onChange={e => { const next = [...(field.options ?? [])]; next[i] = e.target.value; onOptionsChange(next) }}
                  rows={2}
                  placeholder="Clause to acknowledge…"
                  style={{
                    flex: 1, background: 'rgba(255,255,255,0.03)', border: '1px solid rgb(var(--gold-rgb) / 0.15)',
                    borderRadius: '0.35rem', color: CREAM, fontSize: '0.78rem', outline: 'none',
                    padding: '0.35rem 0.5rem', fontFamily: 'inherit', lineHeight: 1.5, resize: 'vertical',
                  }}
                />
              ) : (
                <input
                  value={opt}
                  onChange={e => { const next = [...(field.options ?? [])]; next[i] = e.target.value; onOptionsChange(next) }}
                  style={{
                    flex: 1, background: 'transparent', border: 'none',
                    borderBottom: '1px solid rgb(var(--gold-rgb) / 0.15)',
                    color: CREAM, fontSize: '0.78rem', outline: 'none', padding: '0.05rem 0',
                    fontFamily: 'inherit',
                  }}
                />
              )}
              <button
                onClick={() => onOptionsChange((field.options ?? []).filter((_, j) => j !== i))}
                title="Remove"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', opacity: 0.4, fontSize: '0.75rem', padding: 0, marginTop: isAgreement ? '0.35rem' : 0 }}
              >✕</button>
            </div>
          ))}
          <button
            onClick={() => onOptionsChange([...(field.options ?? []), isAgreement ? 'I agree to…' : 'New option'])}
            style={{
              marginTop: '0.2rem', background: 'none', border: '1px dashed rgb(var(--gold-rgb) / 0.2)',
              borderRadius: '0.3rem', color: GOLD, opacity: 0.55,
              fontSize: '0.68rem', padding: '0.2rem 0.5rem', cursor: 'pointer',
              alignSelf: 'flex-start',
            }}
          >+ Add {isAgreement ? 'clause' : 'option'}</button>
        </div>
      )}

      {/* Group picker for the Group selection field. options = included group ids
          (unset = all groups). onOptionsChange always provided for custom fields. */}
      {field.type === 'group_select' && onOptionsChange && (
        <div style={{ padding: '0 0.85rem 0.75rem 2.5rem' }}>
          {groups.length === 0 ? (
            <p style={{ fontSize: '0.72rem', opacity: 0.45, fontStyle: 'italic', margin: 0 }}>
              No groups yet — create groups in Admin → Groups, then choose which appear here.
            </p>
          ) : (
            <>
              <p style={{ fontSize: '0.68rem', opacity: 0.45, margin: '0 0 0.4rem' }}>
                Groups offered by this field {field.options === undefined ? '(all — uncheck any to limit)' : ''}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                {groups.map(g => {
                  // Unset options ⇒ all included; otherwise only the listed ids.
                  const included = field.options === undefined ? true : field.options.includes(g.id)
                  return (
                    <label key={g.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.78rem', color: CREAM, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={included}
                        onChange={() => {
                          // First edit on an unset field starts from "all included".
                          const base = field.options === undefined ? groups.map(x => x.id) : field.options
                          const next = included ? base.filter(id => id !== g.id) : [...base, g.id]
                          onOptionsChange(next)
                        }}
                        style={{ accentColor: PURPLE }}
                      />
                      {g.name}
                    </label>
                  )
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── Step section ──────────────────────────────────────────────────────────────

function StepSection({
  step, index, total, displayNum, expanded, saving,
  onToggleExpand, onToggleVisible, onMoveUp, onMoveDown,
  onTitleChange, onSubtitleChange, onFieldChange, onDelete, onAddField, onDeleteField,
  fieldsModular, onMoveField, onReorderField, onToggleFieldWidth, onAddElement, groups, profileFieldOptions,
}: {
  step: StepConfig
  index: number
  total: number
  displayNum: string
  expanded: boolean
  saving: boolean
  groups: { id: string; name: string }[]
  profileFieldOptions?: { key: string; label: string }[]
  onToggleExpand: () => void
  onToggleVisible: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  onTitleChange: (v: string) => void
  onSubtitleChange: (v: string) => void
  onFieldChange: (fieldKey: string, patch: Partial<FieldConfig>) => void
  onDelete: () => void
  onAddField: (type: string) => void
  onDeleteField: (fieldKey: string) => void
  // When true, fields can be reordered + width-toggled (section is rendered by
  // the modular renderer on the live form).
  fieldsModular?: boolean
  onMoveField?: (fieldKey: string, dir: -1 | 1) => void
  onReorderField?: (fieldKey: string, toIndex: number) => void
  onToggleFieldWidth?: (fieldKey: string) => void
  onAddElement?: (element: 'divider' | 'paragraph') => void
}) {
  // Drag-to-reorder within this section. The row only becomes draggable while
  // its grip is pressed (grabKey) — otherwise dragging would hijack text
  // selection in the inline label/description inputs. Arrows stay as the
  // touch/keyboard fallback (HTML5 drag doesn't fire on touch).
  const dragEnabled = !!(fieldsModular && onReorderField)
  const [grabKey, setGrabKey] = useState<string | null>(null)
  const [dragKey, setDragKey] = useState<string | null>(null)
  const [overIdx, setOverIdx] = useState<number | null>(null)

  const endDrag = () => { setDragKey(null); setGrabKey(null); setOverIdx(null) }
  // Insertion index for a pointer at clientY over the row at fIdx.
  const insertionIndex = (e: React.DragEvent, fIdx: number) => {
    const r = e.currentTarget.getBoundingClientRect()
    return e.clientY < r.top + r.height / 2 ? fIdx : fIdx + 1
  }

  return (
    <div style={{
      border: '1px solid rgb(var(--gold-rgb) / 0.15)',
      borderRadius: '0.75rem',
      background: 'rgb(var(--gold-rgb) / 0.02)',
      marginBottom: '0.75rem',
      opacity: step.visible ? 1 : 0.5,
      transition: 'opacity 0.2s',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', padding: '0.75rem 1rem' }}>
        <button
          onClick={onToggleExpand}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: GOLD, opacity: 0.6, padding: '0.1rem', flexShrink: 0,
            transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>

        <span style={{ fontSize: '0.65rem', letterSpacing: '0.15em', color: GOLD, opacity: step.visible ? 0.7 : 0.3, flexShrink: 0, minWidth: '1.2em' }}>{displayNum}</span>

        <input
          value={step.title}
          onChange={e => onTitleChange(e.target.value)}
          style={{
            background: 'transparent', border: 'none', borderBottom: '1px solid transparent',
            color: GOLD, fontSize: '0.82rem', letterSpacing: '0.1em', outline: 'none',
            fontFamily: 'inherit', fontWeight: 600, flex: 1, minWidth: 0,
          }}
          onFocus={e => { e.currentTarget.style.borderBottomColor = 'rgb(var(--gold-rgb) / 0.4)' }}
          onBlur={e => { e.currentTarget.style.borderBottomColor = 'transparent' }}
        />

        <input
          value={step.subtitle}
          onChange={e => onSubtitleChange(e.target.value)}
          style={{
            background: 'transparent', border: 'none', borderBottom: '1px solid transparent',
            color: CREAM, fontSize: '0.72rem', outline: 'none',
            fontFamily: 'inherit', opacity: 0.45, width: '140px', flexShrink: 0,
          }}
          onFocus={e => { e.currentTarget.style.borderBottomColor = 'rgb(var(--gold-rgb) / 0.3)' }}
          onBlur={e => { e.currentTarget.style.borderBottomColor = 'transparent' }}
        />

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', flexShrink: 0 }}>
          {step.canHide && (
            <EyeBtn visible={step.visible} disabled={saving} onChange={onToggleVisible} />
          )}
          <button
            onClick={onMoveUp}
            disabled={index === 0 || saving}
            title="Move up"
            style={{
              background: 'none', border: 'none', cursor: index === 0 ? 'default' : 'pointer',
              color: CREAM, opacity: index === 0 ? 0.15 : 0.45, padding: '0.1rem',
              fontSize: '0.7rem',
            }}
          >↑</button>
          <button
            onClick={onMoveDown}
            disabled={index === total - 1 || saving}
            title="Move down"
            style={{
              background: 'none', border: 'none', cursor: index === total - 1 ? 'default' : 'pointer',
              color: CREAM, opacity: index === total - 1 ? 0.15 : 0.45, padding: '0.1rem',
              fontSize: '0.7rem',
            }}
          >↓</button>
          {step.key !== 'basic' && (
            <button
              onClick={onDelete}
              disabled={saving}
              title="Delete section"
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--danger)', opacity: 0.45, padding: '0.1rem 0.3rem',
                fontSize: '0.75rem', lineHeight: 1,
              }}
            >✕</button>
          )}
        </div>
      </div>

      {/* Fields */}
      {expanded && (
        <div style={{ padding: '0 1rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          {step.fields.map((field, fIdx) => {
            // Only the ends pin the arrows; non-locked fields may move past
            // locked core fields (which can't be grabbed directly themselves).
            const pinUp = fIdx === 0
            const pinDown = fIdx === step.fields.length - 1
            const row = field.element ? (
              <ElementRow
                field={field}
                saving={saving}
                onLabelChange={v => onFieldChange(field.key, { label: v })}
                onDescChange={v => onFieldChange(field.key, { description: v })}
                onToggleVisible={() => onFieldChange(field.key, { visible: !field.visible })}
                onMoveUp={fieldsModular && onMoveField ? () => onMoveField(field.key, -1) : undefined}
                onMoveDown={fieldsModular && onMoveField ? () => onMoveField(field.key, 1) : undefined}
                isFirst={pinUp}
                isLast={pinDown}
                onDelete={() => onDeleteField(field.key)}
              />
            ) : (
              <FieldRow
                field={field}
                saving={saving}
                onToggleVisible={() => onFieldChange(field.key, { visible: !field.visible })}
                onToggleRequired={() => onFieldChange(field.key, { required: !field.required })}
                onLabelChange={v => onFieldChange(field.key, { label: v })}
                onDescChange={v => onFieldChange(field.key, { description: v })}
                onOptionsChange={(field.isCustom || field.type === 'agreement') ? opts => onFieldChange(field.key, { options: opts }) : undefined}
                onMoveUp={fieldsModular && onMoveField ? () => onMoveField(field.key, -1) : undefined}
                onMoveDown={fieldsModular && onMoveField ? () => onMoveField(field.key, 1) : undefined}
                isFirst={pinUp}
                isLast={pinDown}
                onToggleWidth={fieldsModular && onToggleFieldWidth ? () => onToggleFieldWidth(field.key) : undefined}
                onDelete={!field.locked ? () => onDeleteField(field.key) : undefined}
                groups={groups}
                profileFieldOptions={profileFieldOptions}
                onBindProfileField={field.isCustom ? key => onFieldChange(field.key, { profileFieldKey: key }) : undefined}
              />
            )
            if (!dragEnabled) return <div key={field.key}>{row}</div>
            const canDrag = !field.locked && !saving
            return (
              <div
                key={field.key}
                draggable={grabKey === field.key}
                onDragStart={e => {
                  setDragKey(field.key)
                  e.dataTransfer.setData('text/plain', field.key) // Firefox needs data to start a drag
                  e.dataTransfer.effectAllowed = 'move'
                }}
                onDragEnd={endDrag}
                onDragOver={e => {
                  if (!dragKey) return // a drag from some other section — ignore
                  e.preventDefault()
                  e.dataTransfer.dropEffect = 'move'
                  setOverIdx(insertionIndex(e, fIdx))
                }}
                onDrop={e => {
                  if (!dragKey) return
                  e.preventDefault()
                  onReorderField!(dragKey, insertionIndex(e, fIdx))
                  endDrag()
                }}
                style={{
                  display: 'flex', alignItems: 'stretch', gap: '0.45rem',
                  borderRadius: '0.5rem',
                  opacity: dragKey === field.key ? 0.35 : 1,
                  // Gold insertion line above the row the drop would land before
                  // (below the last row for an at-the-end drop).
                  boxShadow: dragKey && overIdx === fIdx ? `0 -3px 0 0 ${GOLD}`
                    : dragKey && pinDown && overIdx === fIdx + 1 ? `0 3px 0 0 ${GOLD}`
                    : 'none',
                  transition: 'opacity 0.15s',
                }}
              >
                {canDrag ? (
                  <div
                    onMouseDown={() => setGrabKey(field.key)}
                    onMouseUp={() => setGrabKey(null)}
                    title="Drag to reorder"
                    style={{
                      display: 'flex', alignItems: 'center', flexShrink: 0,
                      cursor: 'grab', color: CREAM, opacity: 0.3,
                      padding: '0 0.15rem', userSelect: 'none',
                    }}
                  >
                    <svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor" aria-hidden="true">
                      <circle cx="3" cy="3" r="1.3" /><circle cx="7" cy="3" r="1.3" />
                      <circle cx="3" cy="8" r="1.3" /><circle cx="7" cy="8" r="1.3" />
                      <circle cx="3" cy="13" r="1.3" /><circle cx="7" cy="13" r="1.3" />
                    </svg>
                  </div>
                ) : (
                  <div style={{ width: 'calc(10px + 0.3rem)', flexShrink: 0 }} /> // keep locked rows aligned
                )}
                <div style={{ flex: 1, minWidth: 0 }}>{row}</div>
              </div>
            )
          })}
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
              {(['text', 'textarea', 'radio', 'checkbox', 'file', 'agreement', ...(fieldsModular ? ['group_select'] as const : [])] as const).map(type => (
                <button
                  key={type}
                  onClick={() => onAddField(type)}
                  disabled={saving}
                  style={{
                    padding: '0.3rem 0.75rem', borderRadius: '9999px',
                    border: '1px dashed rgb(var(--purple-rgb) / 0.3)',
                    background: 'transparent', color: PURPLE,
                    fontSize: '0.7rem', cursor: 'pointer', opacity: 0.65,
                    transition: 'opacity 0.15s',
                  }}
                >+ {FIELD_TYPE_LABELS[type]}</button>
              ))}
              {fieldsModular && onAddElement && (['divider', 'paragraph'] as const).map(el => (
                <button
                  key={el}
                  onClick={() => onAddElement(el)}
                  disabled={saving}
                  style={{
                    padding: '0.3rem 0.75rem', borderRadius: '9999px',
                    border: '1px dashed rgb(var(--gold-rgb) / 0.3)',
                    background: 'transparent', color: GOLD,
                    fontSize: '0.7rem', cursor: 'pointer', opacity: 0.6,
                    transition: 'opacity 0.15s',
                  }}
                >+ {el === 'divider' ? 'Divider' : 'Text block'}</button>
              ))}
            </div>
        </div>
      )}
    </div>
  )
}

// ── Status banner ─────────────────────────────────────────────────────────────

// Editor for an apply-page track card's title + description ("How would you like
// to join?" — Camp Member / Volunteer cards).
function TrackCardEditor({ heading, title, desc, onTitleChange, onDescChange, saving }: {
  heading: string; title: string; desc: string
  onTitleChange: (v: string) => void; onDescChange: (v: string) => void; saving: boolean
}) {
  return (
    <div style={{ border: '1px solid rgb(var(--gold-rgb) / 0.15)', borderRadius: '0.75rem', background: 'rgb(var(--gold-rgb) / 0.02)', padding: '1rem', marginBottom: '1.5rem' }}>
      <p style={{ fontSize: '0.62rem', letterSpacing: '0.18em', textTransform: 'uppercase', color: LAVENDER, opacity: 0.55, margin: '0 0 0.75rem' }}>{heading}</p>
      <input
        value={title}
        onChange={e => onTitleChange(e.target.value)}
        placeholder="Card title"
        disabled={saving}
        style={{ width: '100%', boxSizing: 'border-box', background: 'transparent', border: 'none', borderBottom: '1px solid rgb(var(--gold-rgb) / 0.2)', color: GOLD, fontSize: '0.95rem', outline: 'none', padding: '0 0 0.3rem', marginBottom: '0.7rem', fontFamily: 'inherit' }}
      />
      <textarea
        value={desc}
        onChange={e => onDescChange(e.target.value)}
        placeholder="Card description shown on the apply page"
        rows={2}
        style={{ width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,0.03)', border: '1px solid rgb(var(--gold-rgb) / 0.15)', borderRadius: '0.4rem', color: CREAM, fontSize: '0.82rem', outline: 'none', padding: '0.45rem 0.6rem', fontFamily: 'inherit', lineHeight: 1.6, resize: 'vertical' }}
      />
    </div>
  )
}

function StatusBanner({ open, saving, onToggle }: { open: boolean; saving: boolean; onToggle: () => void }) {
  return (
    <div style={{
      padding: '1rem 1.25rem', borderRadius: '0.65rem', marginBottom: '1.5rem',
      border: `1px solid ${open ? 'rgb(var(--gold-rgb) / 0.3)' : 'rgba(255,80,80,0.3)'}`,
      background: open ? 'rgb(var(--gold-rgb) / 0.05)' : 'rgba(255,80,80,0.05)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1.5rem',
    }}>
      <div>
        <p style={{ margin: '0 0 0.15rem', fontSize: '0.88rem', fontWeight: 600, color: open ? GOLD : 'var(--danger-strong)' }}>
          Applications {open ? 'open' : 'closed'}
        </p>
        <p style={{ margin: 0, fontSize: '0.75rem', opacity: 0.5 }}>
          {open ? 'New submissions are being accepted.' : 'This form is hidden from new visitors.'}
        </p>
      </div>
      <Toggle checked={open} disabled={saving} onChange={onToggle} color={open ? GOLD : 'var(--danger-strong)'} />
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function ApplicationBuilder({
  memberConfig: initialMember,
  volunteerConfig: initialVolunteer,
  trackCopy: initialTrackCopy,
}: {
  memberConfig: MemberFormConfig
  volunteerConfig: VolunteerFormConfig
  trackCopy?: TrackCopy
}) {
  type SaveKey = 'config_member_form' | 'config_volunteer_form' | 'config_track_picker'

  const [memberConfig, setMemberConfig] = useState<MemberFormConfig>(initialMember)
  const [volunteerConfig, setVolunteerConfig] = useState<VolunteerFormConfig>(initialVolunteer)
  const [trackCopy, setTrackCopy] = useState<TrackCopy>(initialTrackCopy ?? DEFAULT_TRACK_COPY)
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [saveError, setSaveError] = useState<string | null>(null)
  // Config keys with local edits that haven't been persisted yet.
  const [dirtyKeys, setDirtyKeys] = useState<Set<SaveKey>>(new Set())
  const [activeTab, setActiveTab] = useState<'member' | 'volunteer'>('member')
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set())
  const { confirm, confirmDialog } = useConfirm()
  // All groups, for the "Group selection" field's group picker.
  const [allGroups, setAllGroups] = useState<{ id: string; name: string }[]>([])
  useEffect(() => {
    fetch('/api/admin/groups')
      .then(r => r.json())
      .then(d => setAllGroups((d.groups ?? []).map((g: { id: string; name: string }) => ({ id: g.id, name: g.name }))))
      .catch(() => { /* leave empty */ })
  }, [])

  // Application-eligible Profile Fields — the registry fields a custom question
  // can save its answer into (Phase 3). Fetched from the page-content config.
  const [profileFieldOptions, setProfileFieldOptions] = useState<{ key: string; label: string }[]>([])
  useEffect(() => {
    fetch('/api/admin/page-content')
      .then(r => r.json())
      .then(d => {
        const fields = parseProfileFields(d.content?.config_profile_fields)
        setProfileFieldOptions(applicationFields(fields).map(f => ({ key: f.key, label: f.label })))
      })
      .catch(() => { /* leave empty */ })
  }, [])

  // ── Manual save ──
  // Edits only touch local state and mark their config key dirty; nothing is
  // persisted until the admin clicks Save (or ⌘S). `savedRef` holds the
  // last-persisted value of each key so Discard can restore it and the
  // open/closed toggles can go live without committing unsaved edits.

  const savedRef = useRef<{
    config_member_form: MemberFormConfig
    config_volunteer_form: VolunteerFormConfig
    config_track_picker: TrackCopy
  }>({
    config_member_form: initialMember,
    config_volunteer_form: initialVolunteer,
    config_track_picker: initialTrackCopy ?? DEFAULT_TRACK_COPY,
  })

  const dirty = dirtyKeys.size > 0

  const markDirty = useCallback((key: SaveKey) => {
    setDirtyKeys(prev => (prev.has(key) ? prev : new Set(prev).add(key)))
  }, [])

  // Persist the given config keys in one PATCH. Returns true on success.
  const persist = useCallback(async (updates: Partial<Record<SaveKey, object>>) => {
    setSaving(true)
    setSaveStatus('saving')
    setSaveError(null)
    try {
      const body: Record<string, string> = {}
      for (const [k, v] of Object.entries(updates)) body[k] = JSON.stringify(v)
      const res = await fetch('/api/admin/page-content', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setSaveError(d.error ?? 'Save failed')
        setSaveStatus('error')
        setSaving(false)
        return false
      }
      for (const [k, v] of Object.entries(updates)) {
        ;(savedRef.current as Record<SaveKey, object>)[k as SaveKey] = v as object
      }
      setSaveStatus('saved')
      setSaving(false)
      return true
    } catch {
      setSaveError('Network error')
      setSaveStatus('error')
      setSaving(false)
      return false
    }
  }, [])

  const handleSave = useCallback(async () => {
    if (dirtyKeys.size === 0 || saving) return
    const current: Record<SaveKey, object> = {
      config_member_form: memberConfig,
      config_volunteer_form: volunteerConfig,
      config_track_picker: trackCopy,
    }
    const updates: Partial<Record<SaveKey, object>> = {}
    dirtyKeys.forEach(k => { updates[k] = current[k] })
    if (await persist(updates)) {
      // Clear only the keys this save covered — an edit that landed mid-flight
      // re-marks its key dirty and survives this functional update.
      setDirtyKeys(prev => {
        const next = new Set(prev)
        for (const k of Object.keys(updates)) next.delete(k as SaveKey)
        return next
      })
    }
  }, [dirtyKeys, saving, memberConfig, volunteerConfig, trackCopy, persist])

  async function handleDiscard() {
    const ok = await confirm({
      title: 'Discard unsaved changes?',
      body: 'The builder returns to the last saved version.',
      confirmLabel: 'Discard',
      danger: true,
    })
    if (!ok) return
    setMemberConfig(savedRef.current.config_member_form)
    setVolunteerConfig(savedRef.current.config_volunteer_form)
    setTrackCopy(savedRef.current.config_track_picker)
    setDirtyKeys(new Set())
    setSaveStatus('idle')
  }

  // Warn before leaving the page with unsaved edits (reload / close / external
  // links — client-side nav within the SPA isn't interceptable, the floating
  // bar is the guard there).
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  // ⌘S / Ctrl+S saves.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        handleSave()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleSave])

  // ── Member helpers ──

  function toggleMemberOpen() {
    const open = !memberConfig.open
    // The open/closed switch stays live (it's an operational control, not a
    // form edit) — but it must not silently commit unsaved edits, so it
    // persists the last-saved config with just the flag flipped. The local
    // (possibly edited) state flips too, so a later Save keeps the flag.
    setMemberConfig({ ...memberConfig, open })
    persist({ config_member_form: { ...savedRef.current.config_member_form, open } })
      .then(ok => { if (!ok) markDirty('config_member_form') })
  }

  function setMemberStep(stepKey: string, stepPatch: Partial<Pick<StepConfig, 'title' | 'subtitle' | 'visible'>>) {
    const steps = memberConfig.steps.map(s => s.key === stepKey ? { ...s, ...stepPatch } : s)
    setMemberConfig({ ...memberConfig, steps })
    markDirty('config_member_form')
  }

  function moveMemberStep(index: number, dir: -1 | 1) {
    const steps = [...memberConfig.steps]
    const target = index + dir
    if (target < 0 || target >= steps.length) return
    ;[steps[index], steps[target]] = [steps[target], steps[index]]
    setMemberConfig({ ...memberConfig, steps })
    markDirty('config_member_form')
  }

  function moveMemberField(stepKey: string, fieldKey: string, dir: -1 | 1) {
    const steps = memberConfig.steps.map(s => {
      if (s.key !== stepKey) return s
      const fields = [...s.fields]
      const idx = fields.findIndex(f => f.key === fieldKey)
      const target = idx + dir
      if (idx < 0 || target < 0 || target >= fields.length) return s
      // Locked core fields can't be grabbed directly, but other fields may move
      // past them (the locked field shifts by one, keeping its relative order).
      if (fields[idx].locked) return s
      ;[fields[idx], fields[target]] = [fields[target], fields[idx]]
      return { ...s, fields }
    })
    setMemberConfig({ ...memberConfig, steps })
    markDirty('config_member_form')
  }

  // Drag-and-drop: move a field to an arbitrary position within its section.
  // `toIndex` is the insertion index in the pre-removal list.
  function reorderMemberField(stepKey: string, fieldKey: string, toIndex: number) {
    const steps = memberConfig.steps.map(s => {
      if (s.key !== stepKey) return s
      const fields = [...s.fields]
      const from = fields.findIndex(f => f.key === fieldKey)
      if (from < 0 || fields[from].locked) return s
      const [moved] = fields.splice(from, 1)
      fields.splice(toIndex > from ? toIndex - 1 : toIndex, 0, moved)
      return { ...s, fields }
    })
    setMemberConfig({ ...memberConfig, steps })
    markDirty('config_member_form')
  }

  function toggleMemberFieldWidth(stepKey: string, fieldKey: string) {
    const steps = memberConfig.steps.map(s => {
      if (s.key !== stepKey) return s
      const fields = s.fields.map(f =>
        f.key === fieldKey
          ? ({ ...f, width: ((f.width ?? 'full') === 'half' ? 'full' : 'half') } as FieldConfig)
          : f
      )
      return { ...s, fields }
    })
    setMemberConfig({ ...memberConfig, steps })
    markDirty('config_member_form')
  }

  function setMemberField(stepKey: string, fieldKey: string, fieldPatch: Partial<FieldConfig>) {
    const steps = memberConfig.steps.map(s => {
      if (s.key !== stepKey) return s
      const fields = s.fields.map(f => f.key === fieldKey ? { ...f, ...fieldPatch } : f)
      return { ...s, fields }
    })
    setMemberConfig({ ...memberConfig, steps })
    markDirty('config_member_form')
  }

  // ── Delete / add step ──

  async function handleDeleteStep(stepKey: string) {
    const step = memberConfig.steps.find(s => s.key === stepKey)
    if (!step) return
    const hasRequiredCore = step.fields.some(f => f.required && !f.canHide)
    const ok = await confirm({
      title: `Delete “${step.title}”?`,
      body: hasRequiredCore
        ? "It has required fields — applicants won't see them."
        : 'The section disappears when you save — discard unsaved changes to bring it back.',
      confirmLabel: 'Delete section',
      danger: true,
    })
    if (!ok) return
    setMemberConfig({ ...memberConfig, steps: memberConfig.steps.filter(s => s.key !== stepKey) })
    markDirty('config_member_form')
    setExpandedSteps(prev => { const n = new Set(prev); n.delete(stepKey); return n })
  }

  function handleAddStep() {
    const key = `custom_${Date.now()}`
    const newStep: StepConfig = {
      key, num: '', title: 'NEW SECTION', subtitle: 'Describe this section.',
      visible: true, canHide: true, isCustom: true, fields: [],
    }
    setMemberConfig({ ...memberConfig, steps: [...memberConfig.steps, newStep] })
    markDirty('config_member_form')
    setExpandedSteps(prev => { const n = new Set(prev); n.add(key); return n })
  }

  function handleAddField(stepKey: string, type: string) {
    const fieldKey = `cf_${Date.now()}`
    const newField: FieldConfig = {
      key: fieldKey,
      label: type === 'group_select' ? 'Which groups would you like to join?' : 'New question',
      description: type === 'group_select' ? 'Optional — you can be added or removed later.' : undefined,
      visible: true, required: false,
      canHide: true, canChangeRequired: true,
      isCustom: true,
      type: type as FieldConfig['type'],
      options: (type === 'radio' || type === 'checkbox') ? ['Option 1', 'Option 2']
        : type === 'agreement' ? ['I agree to…']
        : undefined,
    }
    setMemberConfig({
      ...memberConfig,
      steps: memberConfig.steps.map(s =>
        s.key === stepKey ? { ...s, fields: [...s.fields, newField] } : s
      ),
    })
    markDirty('config_member_form')
  }

  async function handleResetMemberForm() {
    const ok = await confirm({
      title: 'Reset the member application form to its defaults?',
      body: 'Custom fields, text blocks, deletions, and layout changes will be lost when you save. (The open/closed status is kept.)',
      confirmLabel: 'Reset form',
      danger: true,
    })
    if (!ok) return
    const fresh = mergeMemberConfig({ open: memberConfig.open })
    setMemberConfig(fresh)
    setExpandedSteps(new Set())
    markDirty('config_member_form')
  }

  function handleAddElement(stepKey: string, element: 'divider' | 'paragraph') {
    const newEl: FieldConfig = {
      key: `el_${Date.now()}`,
      element,
      label: '',
      description: element === 'paragraph' ? 'New text block' : undefined,
      visible: true, required: false, canHide: true, canChangeRequired: false,
      isCustom: true,
    }
    setMemberConfig({
      ...memberConfig,
      steps: memberConfig.steps.map(s =>
        s.key === stepKey ? { ...s, fields: [...s.fields, newEl] } : s
      ),
    })
    markDirty('config_member_form')
  }

  function handleDeleteField(stepKey: string, fieldKey: string) {
    setMemberConfig({
      ...memberConfig,
      steps: memberConfig.steps.map(s =>
        s.key === stepKey ? { ...s, fields: s.fields.filter(f => f.key !== fieldKey) } : s
      ),
    })
    markDirty('config_member_form')
  }

  // ── Volunteer helpers ──

  function toggleVolunteerOpen() {
    const open = !volunteerConfig.open
    // Live operational switch — same pattern as toggleMemberOpen.
    setVolunteerConfig({ ...volunteerConfig, open })
    persist({ config_volunteer_form: { ...savedRef.current.config_volunteer_form, open } })
      .then(ok => { if (!ok) markDirty('config_volunteer_form') })
  }

  function setVolunteerField(fieldKey: string, fieldPatch: Partial<FieldConfig>) {
    const fields = volunteerConfig.fields.map(f => f.key === fieldKey ? { ...f, ...fieldPatch } : f)
    setVolunteerConfig({ ...volunteerConfig, fields })
    markDirty('config_volunteer_form')
  }

  // ── Track-card copy ──

  function setTrackCopyField(key: keyof TrackCopy, value: string) {
    setTrackCopy({ ...trackCopy, [key]: value })
    markDirty('config_track_picker')
  }

  // ── Tab style ──

  function tabStyle(id: 'member' | 'volunteer'): React.CSSProperties {
    const active = activeTab === id
    return {
      padding: '0.45rem 1.1rem',
      borderRadius: '9999px',
      fontSize: '0.75rem', letterSpacing: '0.08em',
      border: active ? '1px solid rgb(var(--purple-rgb) / 0.5)' : '1px solid rgb(var(--gold-rgb) / 0.2)',
      color: active ? PURPLE : CREAM,
      background: active ? 'rgb(var(--purple-rgb) / 0.08)' : 'transparent',
      cursor: 'pointer', opacity: active ? 1 : 0.55,
      transition: 'all 0.15s',
    }
  }

  // ── Render ──

  return (
    <div style={{
      minHeight: '100vh',
      background: `radial-gradient(ellipse at 50% 0%, rgb(var(--plum-rgb) / 0.35) 0%, ${INK} 70%)`,
      color: CREAM,
    }}>
      <div style={{ maxWidth: '960px', margin: '0 auto', padding: '0 1.5rem 6rem' }}>

        <AdminNav />

        {/* Floating save bar — always visible, even scrolled down. Manual save:
            edits mark the config dirty, the bar shows it unmissably, and only
            the Save button (or ⌘S) persists. Positioning lives in the class so
            the mobile media query can move it to a thumb-reachable spot. */}
        <style dangerouslySetInnerHTML={{ __html: `
          .ab-savebar { position: fixed; top: 1rem; right: 1rem; z-index: 50; }
          @media (max-width: 640px) {
            .ab-savebar { top: auto; bottom: 1.25rem; right: 50%; transform: translateX(50%); max-width: calc(100vw - 2rem); }
          }
          @keyframes ab-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
        ` }} />
        <div className="ab-savebar" style={{
          display: 'flex', alignItems: 'center', gap: '0.6rem',
          padding: dirty && saveStatus !== 'saving' ? '0.35rem 0.4rem 0.35rem 1rem' : '0.45rem 0.9rem',
          borderRadius: '9999px',
          background: 'rgba(20,10,30,0.88)', backdropFilter: 'blur(6px)',
          border: `1px solid ${
            saveStatus === 'error' ? 'rgb(var(--danger-rgb) / 0.4)'
            : saveStatus === 'saving' ? 'rgb(var(--gold-rgb) / 0.35)'
            : dirty ? 'rgb(var(--gold-rgb) / 0.55)'
            : 'rgb(var(--success-rgb) / 0.3)'
          }`,
          fontSize: '0.72rem', letterSpacing: '0.04em',
          boxShadow: dirty ? '0 4px 20px rgb(var(--gold-rgb) / 0.18), 0 4px 16px rgba(0,0,0,0.4)' : '0 4px 16px rgba(0,0,0,0.4)',
          transition: 'border-color 0.2s, box-shadow 0.2s',
        }}>
          {saveStatus === 'saving' ? (
            <span style={{ color: GOLD, opacity: 0.9, display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}>
              <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: GOLD, display: 'inline-block' }} />
              Saving…
            </span>
          ) : saveStatus === 'error' ? (
            <>
              <span style={{ color: 'var(--danger)' }}>⚠ Couldn&apos;t save{saveError ? ` — ${saveError}` : ''}</span>
              <button
                onClick={handleSave}
                disabled={saving}
                style={{
                  padding: '0.3rem 0.9rem', borderRadius: '9999px', border: 'none',
                  background: 'linear-gradient(135deg, var(--gold), var(--gold-deep))', color: '#1A0A00',
                  fontSize: '0.7rem', fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer',
                }}
              >Retry</button>
            </>
          ) : dirty ? (
            <>
              <span style={{ color: GOLD, display: 'inline-flex', alignItems: 'center', gap: '0.45rem', whiteSpace: 'nowrap' }}>
                <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: GOLD, display: 'inline-block', animation: 'ab-pulse 1.6s ease-in-out infinite' }} />
                Unsaved changes
              </span>
              <button
                onClick={handleDiscard}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: CREAM, opacity: 0.45, fontSize: '0.7rem', letterSpacing: '0.04em',
                  textDecoration: 'underline', textUnderlineOffset: '3px', padding: '0.3rem 0.15rem',
                }}
              >Discard</button>
              <button
                onClick={handleSave}
                style={{
                  padding: '0.35rem 1.1rem', borderRadius: '9999px', border: 'none',
                  background: 'linear-gradient(135deg, var(--gold), var(--gold-deep))', color: '#1A0A00',
                  fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.05em', cursor: 'pointer',
                  boxShadow: '0 2px 8px rgb(var(--gold-rgb) / 0.35)',
                }}
              >Save</button>
            </>
          ) : (
            <span style={{ color: 'var(--success)', opacity: saveStatus === 'saved' ? 0.95 : 0.6, display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}>
              <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: 'var(--success)', display: 'inline-block' }} />
              All changes saved
            </span>
          )}
        </div>

        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.6rem, 4vw, 2.2rem)', color: GOLD, textAlign: 'center', marginBottom: '2rem', letterSpacing: '0.08em' }}>
          APPLICATION BUILDER
        </h1>

        {/* Tab bar */}
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', marginBottom: '2.5rem' }}>
          <button style={tabStyle('member')} onClick={() => setActiveTab('member')}>Camp Member Application</button>
          <button style={tabStyle('volunteer')} onClick={() => setActiveTab('volunteer')}>Volunteer Signup</button>
        </div>

        {/* ── MEMBER TAB ── */}
        {activeTab === 'member' && (
          <div>
            <StatusBanner open={memberConfig.open} saving={saving} onToggle={toggleMemberOpen} />

            <TrackCardEditor
              heading="Apply-page card · Camp Member"
              title={trackCopy.memberTitle}
              desc={trackCopy.memberDesc}
              onTitleChange={v => setTrackCopyField('memberTitle', v)}
              onDescChange={v => setTrackCopyField('memberDesc', v)}
              saving={saving}
            />

            {memberConfig.steps.map((step, idx) => (
              <StepSection
                key={step.key}
                step={step}
                index={idx}
                total={memberConfig.steps.length}
                displayNum={
                  step.visible
                    ? (ROMAN[memberConfig.steps.slice(0, idx).filter(s => s.visible).length] ?? '')
                    : '–'
                }
                expanded={expandedSteps.has(step.key)}
                saving={saving}
                onToggleExpand={() => setExpandedSteps(prev => {
                  const next = new Set(prev)
                  if (next.has(step.key)) next.delete(step.key)
                  else next.add(step.key)
                  return next
                })}
                onToggleVisible={() => setMemberStep(step.key, { visible: !step.visible })}
                onMoveUp={() => moveMemberStep(idx, -1)}
                onMoveDown={() => moveMemberStep(idx, 1)}
                onTitleChange={v => setMemberStep(step.key, { title: v })}
                onSubtitleChange={v => setMemberStep(step.key, { subtitle: v })}
                onFieldChange={(fieldKey, fp) => setMemberField(step.key, fieldKey, fp)}
                onDelete={() => handleDeleteStep(step.key)}
                onAddField={type => handleAddField(step.key, type)}
                onDeleteField={fieldKey => handleDeleteField(step.key, fieldKey)}
                fieldsModular={MODULAR_STEP_KEYS.includes(step.key) || !!step.isCustom}
                onMoveField={(fieldKey, dir) => moveMemberField(step.key, fieldKey, dir)}
                onReorderField={(fieldKey, toIdx) => reorderMemberField(step.key, fieldKey, toIdx)}
                onToggleFieldWidth={fieldKey => toggleMemberFieldWidth(step.key, fieldKey)}
                onAddElement={element => handleAddElement(step.key, element)}
                groups={allGroups}
                profileFieldOptions={profileFieldOptions}
              />
            ))}

            <button
              onClick={handleAddStep}
              disabled={saving}
              style={{
                width: '100%', padding: '0.7rem',
                border: '1px dashed rgb(var(--purple-rgb) / 0.25)',
                borderRadius: '0.75rem', background: 'transparent',
                color: PURPLE, fontSize: '0.8rem', letterSpacing: '0.08em',
                cursor: 'pointer', opacity: 0.6, marginBottom: '1.5rem',
                transition: 'opacity 0.15s',
              }}
            >+ Add section</button>

            <div style={{ textAlign: 'center', marginTop: '0.5rem', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1.25rem', flexWrap: 'wrap' }}>
              <a
                href="/apply?track=member&admin_preview=1"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  padding: '0.65rem 1.75rem', borderRadius: '9999px',
                  border: '1px solid rgb(var(--gold-rgb) / 0.35)',
                  color: GOLD, textDecoration: 'none', fontSize: '0.82rem',
                  letterSpacing: '0.08em', opacity: 0.75,
                  display: 'inline-block',
                }}
              >
                Test this application →
              </a>
              {dirty && (
                <span style={{ fontSize: '0.7rem', fontStyle: 'italic', opacity: 0.45, width: '100%' }}>
                  The preview shows the saved form — save first to see your latest edits.
                </span>
              )}
              <button
                onClick={handleResetMemberForm}
                disabled={saving}
                style={{
                  background: 'none', border: 'none', cursor: saving ? 'not-allowed' : 'pointer',
                  color: CREAM, opacity: 0.4, fontSize: '0.75rem', letterSpacing: '0.06em',
                  textDecoration: 'underline', textUnderlineOffset: '3px',
                }}
              >
                Reset to defaults
              </button>
            </div>
          </div>
        )}

        {/* ── VOLUNTEER TAB ── */}
        {activeTab === 'volunteer' && (
          <div>
            <StatusBanner open={volunteerConfig.open} saving={saving} onToggle={toggleVolunteerOpen} />

            <TrackCardEditor
              heading="Apply-page card · Volunteer"
              title={trackCopy.volunteerTitle}
              desc={trackCopy.volunteerDesc}
              onTitleChange={v => setTrackCopyField('volunteerTitle', v)}
              onDescChange={v => setTrackCopyField('volunteerDesc', v)}
              saving={saving}
            />

            <div style={{
              border: '1px solid rgb(var(--gold-rgb) / 0.15)', borderRadius: '0.75rem',
              background: 'rgb(var(--gold-rgb) / 0.02)', padding: '1rem',
              display: 'flex', flexDirection: 'column', gap: '0.4rem',
            }}>
              <p style={{ fontSize: '0.62rem', letterSpacing: '0.18em', textTransform: 'uppercase', color: LAVENDER, opacity: 0.55, margin: '0 0 0.5rem' }}>
                Form Fields
              </p>
              {volunteerConfig.fields.map(field => (
                <FieldRow
                  key={field.key}
                  field={field}
                  saving={saving}
                  onToggleVisible={() => setVolunteerField(field.key, { visible: !field.visible })}
                  onToggleRequired={() => setVolunteerField(field.key, { required: !field.required })}
                  onLabelChange={v => setVolunteerField(field.key, { label: v })}
                  onDescChange={v => setVolunteerField(field.key, { description: v })}
                />
              ))}
            </div>

            <div style={{ textAlign: 'center', marginTop: '2rem' }}>
              <a
                href="/volunteer?admin_preview=1"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  padding: '0.65rem 1.75rem', borderRadius: '9999px',
                  border: '1px solid rgb(var(--gold-rgb) / 0.35)',
                  color: GOLD, textDecoration: 'none', fontSize: '0.82rem',
                  letterSpacing: '0.08em', opacity: 0.75,
                  display: 'inline-block',
                }}
              >
                Test this application →
              </a>
              {dirty && (
                <p style={{ fontSize: '0.7rem', fontStyle: 'italic', opacity: 0.45, marginTop: '0.6rem' }}>
                  The preview shows the saved form — save first to see your latest edits.
                </p>
              )}
            </div>
          </div>
        )}


      </div>

      {confirmDialog}
    </div>
  )
}
