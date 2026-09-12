'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import dynamic from 'next/dynamic'
import type { Area } from 'react-easy-crop'

// The crop modal only appears on the photo step — most applicants never reach
// it, so keep react-easy-crop (~14KB gzip) out of the wizard's initial load.
// (Cast restores the class's defaultProps typing that dynamic() erases.)
const Cropper = dynamic(
  () => import('react-easy-crop'),
  { ssr: false },
) as unknown as (typeof import('react-easy-crop'))['default']
import type { MemberFormConfig, StepConfig, FieldConfig } from '@/lib/form-config'
import type { ContributionType } from '@/lib/application-options'
import { DEFAULT_CONTRIBUTION_TYPES } from '@/lib/application-options'
import { RichText } from '@/lib/markdown-lite'
import { applicationFileHref, applicationFileName } from '@/lib/application-files'

// ── Constants ─────────────────────────────────────────────────────────────────

const DRAFT_KEY = 'glaum-apply-draft-v2'

// Fallback — replaced at runtime by items passed from page_content
const AGREEMENT_ITEMS_FALLBACK = [
  'I have taken time to familiarise myself with Glåüm and believe it is a community I would genuinely enjoy contributing to.',
  'I understand Glåüm is participatory.',
  'I will contribute honestly within my capacity.',
  'I will communicate if my plans or availability change.',
  'I will help maintain shared spaces and support the collective wellbeing of camp.',
  'I understand setup and teardown are shared responsibilities.',
  'I understand no one person is responsible for carrying the entire camp.',
  'I will treat fellow camp members, neighbours, and participants with kindness, respect, and consideration.',
  'I will leave Glåüm better than I found it.',
  'I agree to comply with all terms and obligations set forth in the Glåüm Sponsorship & Shrimp Awareness Agreement, including but not limited to the reasonable promotion, celebration, and veneration of shrimp.',
]

const DEPT_OPTIONS = [
  'Ceremonial Affairs',
  'Tiny Hand Services',
  'Nourishment',
  'Aesthetic Operations',
  'Environmental Stewardship',
  'Illumination & Electrical Affairs',
  'Logistics & Material Relocation',
  'Many Hands Coordination',
  'Records & Documentation',
]

type FormData = {
  // I
  first_name: string; last_name: string; preferred_name: string; pronouns: string
  email: string; phone: string; instagram: string; location: string
  emergency_contact: string; referral: string; camped_before: string
  avatar_url: string | null
  // II
  about_you: string; special_skills: string; find_at_camp: string
  community_acceptance: string; onboarding_status: string; onboarding_status_other: string
  // III
  attendance: string; arrival_date: string; departure_date: string
  vehicle: string; structures: string; rideshare: string
  // IV
  department_interests: string[]; leadership_interest: string
  setup_preference: string[]; setup_limitations: string[]; setup_notes: string
  // V
  acknowledgements: string[]
  // VI
  shrimp_relationship: string
  // Custom sections
  custom_answers: Record<string, string | string[]>
  // Optional group opt-in (group ids the applicant selected)
  group_choices: string[]
}

const BLANK: FormData = {
  first_name: '', last_name: '', preferred_name: '', pronouns: '',
  email: '', phone: '', instagram: '', location: '',
  emergency_contact: '', referral: '', camped_before: '', avatar_url: null,
  about_you: '', special_skills: '', find_at_camp: '',
  community_acceptance: '', onboarding_status: '', onboarding_status_other: '',
  attendance: '', arrival_date: '', departure_date: '',
  vehicle: '', structures: '', rideshare: '',
  department_interests: [], leadership_interest: '',
  setup_preference: [], setup_limitations: [], setup_notes: '',
  acknowledgements: [],
  shrimp_relationship: '',
  custom_answers: {},
  group_choices: [],
}

// ── Shared styles ─────────────────────────────────────────────────────────────

const GOLD = 'var(--gold)'
const CREAM = 'var(--cream)'
const PURPLE = 'var(--purple)'

const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  padding: '0.65rem 0.9rem',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgb(var(--gold-rgb) / 0.22)',
  borderRadius: '0.65rem',
  color: CREAM, fontSize: '0.9rem', outline: 'none',
  transition: 'border-color 0.2s',
}

// ── Small components ──────────────────────────────────────────────────────────

function Label({ children, optional }: { children: React.ReactNode; optional?: boolean }) {
  return (
    <p style={{ fontSize: '0.72rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: GOLD, opacity: 0.75, margin: '0 0 0.6rem' }}>
      {children}{optional && <span style={{ opacity: 0.5, marginLeft: '0.4rem', textTransform: 'none', letterSpacing: 0, fontSize: '0.78rem' }}>(optional)</span>}
    </p>
  )
}

function Field({ label, optional, required, children }: { label: string; optional?: boolean; required?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '1.9rem' }}>
      <Label optional={optional}>
        {label}
        {required && <span style={{ color: 'var(--danger)', marginLeft: '0.25rem', opacity: 0.85 }}>*</span>}
      </Label>
      {children}
    </div>
  )
}

function Input({ value, onChange, placeholder, type = 'text', maxLength, readOnly }: {
  value: string; onChange: (v: string) => void; placeholder?: string; type?: string; maxLength?: number; readOnly?: boolean
}) {
  return (
    <input
      type={type} value={value} placeholder={placeholder} maxLength={maxLength} readOnly={readOnly}
      onChange={e => onChange(e.target.value)}
      style={{ ...inputStyle, opacity: readOnly ? 0.5 : 1, cursor: readOnly ? 'default' : 'text' }}
      onFocus={e => { if (!readOnly) e.currentTarget.style.borderColor = 'rgb(var(--purple-rgb) / 0.6)' }}
      onBlur={e => { e.currentTarget.style.borderColor = 'rgb(var(--gold-rgb) / 0.22)' }}
    />
  )
}

function Textarea({ value, onChange, placeholder, maxLength = 500 }: {
  value: string; onChange: (v: string) => void; placeholder?: string; maxLength?: number
}) {
  return (
    <div>
      <textarea
        value={value} placeholder={placeholder} maxLength={maxLength}
        onChange={e => onChange(e.target.value)}
        style={{ ...inputStyle, resize: 'vertical', minHeight: '110px', lineHeight: 1.7 }}
        onFocus={e => { e.currentTarget.style.borderColor = 'rgb(var(--purple-rgb) / 0.6)' }}
        onBlur={e => { e.currentTarget.style.borderColor = 'rgb(var(--gold-rgb) / 0.22)' }}
      />
      <p style={{ fontSize: '0.68rem', textAlign: 'right', color: GOLD, opacity: value.length > maxLength * 0.85 ? 0.8 : 0.3, margin: '0.2rem 0 0' }}>
        {value.length} / {maxLength}
      </p>
    </div>
  )
}

// Focus ring shared by the custom radio/checkbox rows below — visible
// keyboard-focus indicator (outline doesn't consume layout space, so it can't
// shift the mobile-stacked columns).
function focusRingOn(e: React.FocusEvent<HTMLElement>) {
  e.currentTarget.style.outline = `2px solid ${GOLD}`
  e.currentTarget.style.outlineOffset = '2px'
}
function focusRingOff(e: React.FocusEvent<HTMLElement>) {
  e.currentTarget.style.outline = 'none'
}
function toggleOnKey(onActivate: () => void) {
  return (e: React.KeyboardEvent<HTMLElement>) => {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
      e.preventDefault()
      onActivate()
    }
  }
}

function RadioGroup({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }} role="radiogroup">
      {options.map(opt => {
        const checked = value === opt
        return (
          <label
            key={opt}
            role="radio"
            aria-checked={checked}
            tabIndex={0}
            onKeyDown={toggleOnKey(() => onChange(opt))}
            onFocus={focusRingOn}
            onBlur={focusRingOff}
            style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', fontSize: '0.9rem', color: CREAM, opacity: checked ? 1 : 0.65, borderRadius: '0.4rem' }}
          >
            <div style={{
              width: '18px', height: '18px', borderRadius: '50%', flexShrink: 0,
              border: `1.5px solid ${checked ? GOLD : 'rgb(var(--gold-rgb) / 0.35)'}`,
              background: checked ? 'rgb(var(--gold-rgb) / 0.12)' : 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }} onClick={() => onChange(opt)}>
              {checked && <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: GOLD }} />}
            </div>
            <span onClick={() => onChange(opt)}>{opt}</span>
          </label>
        )
      })}
    </div>
  )
}

function CheckboxGroup({ options, value, onChange }: { options: string[]; value: string[]; onChange: (v: string[]) => void }) {
  const toggle = (opt: string) => onChange(value.includes(opt) ? value.filter(v => v !== opt) : [...value, opt])
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }} role="group">
      {options.map(opt => {
        const checked = value.includes(opt)
        return (
          <label
            key={opt}
            role="checkbox"
            aria-checked={checked}
            tabIndex={0}
            onKeyDown={toggleOnKey(() => toggle(opt))}
            onFocus={focusRingOn}
            onBlur={focusRingOff}
            style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', cursor: 'pointer', fontSize: '0.9rem', color: CREAM, opacity: checked ? 1 : 0.65, lineHeight: 1.5, borderRadius: '0.4rem' }}
          >
            <div style={{
              width: '18px', height: '18px', borderRadius: '3px', flexShrink: 0, marginTop: '2px',
              border: `1.5px solid ${checked ? GOLD : 'rgb(var(--gold-rgb) / 0.35)'}`,
              background: checked ? 'rgb(var(--gold-rgb) / 0.12)' : 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }} onClick={() => toggle(opt)}>
              {checked && <span style={{ fontSize: '0.7rem', color: GOLD, fontWeight: 700 }}>✓</span>}
            </div>
            <span onClick={() => toggle(opt)}>{opt}</span>
          </label>
        )
      })}
    </div>
  )
}

function Divider({ label }: { label?: string }) {
  if (!label) return <div style={{ height: '1px', background: 'linear-gradient(90deg, transparent, rgb(var(--gold-rgb) / 0.2), transparent)', margin: '2rem 0' }} />
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', margin: '2rem 0 1.5rem' }}>
      <div style={{ flex: 1, height: '1px', background: 'rgb(var(--gold-rgb) / 0.15)' }} />
      <p style={{ fontSize: '0.62rem', letterSpacing: '0.2em', textTransform: 'uppercase', color: GOLD, opacity: 0.5, margin: 0, whiteSpace: 'nowrap' }}>{label}</p>
      <div style={{ flex: 1, height: '1px', background: 'rgb(var(--gold-rgb) / 0.15)' }} />
    </div>
  )
}

// ── Canvas crop helper ────────────────────────────────────────────────────────

async function getCroppedBlob(imageSrc: string, pixelCrop: Area): Promise<Blob> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.addEventListener('load', () => resolve(img))
    img.addEventListener('error', reject)
    img.src = imageSrc
  })
  const canvas = document.createElement('canvas')
  canvas.width = pixelCrop.width
  canvas.height = pixelCrop.height
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(image, pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height, 0, 0, pixelCrop.width, pixelCrop.height)
  return new Promise((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('Canvas empty')), 'image/jpeg', 0.92))
}

// ── Photo upload + crop ───────────────────────────────────────────────────────

function PhotoUpload({ value, onChange }: { value: string | null; onChange: (url: string) => void }) {
  const [rawSrc, setRawSrc] = useState<string | null>(null)
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedArea, setCroppedArea] = useState<Area | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ref = useRef<HTMLInputElement>(null)

  const onCropComplete = useCallback((_: Area, pixels: Area) => setCroppedArea(pixels), [])

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const url = URL.createObjectURL(file)
    setRawSrc(url)
    setZoom(1)
    setCrop({ x: 0, y: 0 })
    e.target.value = ''
  }

  async function handleSave() {
    if (!rawSrc || !croppedArea) return
    setUploading(true)
    setError(null)
    try {
      const blob = await getCroppedBlob(rawSrc, croppedArea)
      const fd = new FormData()
      fd.append('avatar', new File([blob], 'avatar.jpg', { type: 'image/jpeg' }))
      const res = await fetch('/api/profile/avatar', { method: 'POST', body: fd })
      if (res.ok) {
        const data = await res.json()
        onChange(data.avatarUrl)
        setRawSrc(null)
      } else {
        const data = await res.json()
        setError(data.error ?? 'Upload failed')
      }
    } catch {
      setError('Something went wrong. Please try again.')
    }
    setUploading(false)
  }

  return (
    <>
      {rawSrc && (
        <>
          <div onClick={() => !uploading && setRawSrc(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 60 }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 61, background: 'var(--ink-deep)', border: '1px solid rgb(var(--gold-rgb) / 0.25)', borderRadius: '1rem', padding: '1.5rem', width: '90%', maxWidth: '440px' }}>
            <p style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', color: GOLD, margin: '0 0 1rem', textAlign: 'center' }}>Adjust Photo</p>
            <div style={{ position: 'relative', width: '100%', paddingBottom: '100%', borderRadius: '0.75rem', overflow: 'hidden', background: '#000' }}>
              <div style={{ position: 'absolute', inset: 0 }}>
                <Cropper
                  image={rawSrc}
                  crop={crop}
                  zoom={zoom}
                  aspect={1}
                  cropShape="round"
                  showGrid={false}
                  onCropChange={setCrop}
                  onZoomChange={setZoom}
                  onCropComplete={onCropComplete}
                  style={{
                    containerStyle: { borderRadius: '0.75rem' },
                    cropAreaStyle: { border: '2px solid rgb(var(--gold-rgb) / 0.7)', boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)' },
                  }}
                />
              </div>
            </div>
            <div style={{ margin: '1rem 0 0.25rem' }}>
              <p style={{ fontSize: '0.68rem', letterSpacing: '0.1em', color: GOLD, opacity: 0.55, margin: '0 0 0.5rem', textTransform: 'uppercase' }}>Zoom</p>
              <input
                type="range" min={1} max={3} step={0.01} value={zoom}
                onChange={e => setZoom(Number(e.target.value))}
                style={{ width: '100%', accentColor: GOLD, cursor: 'pointer' }}
              />
            </div>
            {error && <p style={{ fontSize: '0.8rem', color: 'var(--danger)', margin: '0.5rem 0' }}>{error}</p>}
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
              <button onClick={() => setRawSrc(null)} disabled={uploading} style={{ padding: '0.55rem 1.1rem', borderRadius: '9999px', border: '1px solid rgb(var(--gold-rgb) / 0.2)', background: 'transparent', color: CREAM, cursor: 'pointer', fontSize: '0.82rem', opacity: 0.7 }}>Cancel</button>
              <button onClick={handleSave} disabled={uploading} style={{ padding: '0.55rem 1.4rem', borderRadius: '9999px', border: 'none', background: uploading ? 'rgb(var(--gold-rgb) / 0.2)' : 'linear-gradient(135deg,var(--gold),var(--gold-deep))', color: uploading ? GOLD : '#1A0800', cursor: uploading ? 'not-allowed' : 'pointer', fontSize: '0.82rem', fontWeight: 600 }}>
                {uploading ? 'Saving…' : 'Save photo'}
              </button>
            </div>
          </div>
        </>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
        <div
          onClick={() => ref.current?.click()}
          style={{ width: '90px', height: '90px', borderRadius: '50%', flexShrink: 0, border: `2px solid ${value ? 'rgba(111,73,31,0.8)' : 'rgb(var(--gold-rgb) / 0.3)'}`, background: 'rgb(var(--gold-rgb) / 0.06)', overflow: 'hidden', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth="1.5" opacity={0.4} strokeLinecap="round">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
          )}
        </div>
        <input ref={ref} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFile} />
        <div>
          <button type="button" onClick={() => ref.current?.click()} style={{ padding: '0.45rem 1rem', borderRadius: '9999px', border: '1px solid rgb(var(--gold-rgb) / 0.35)', background: 'transparent', color: GOLD, fontSize: '0.8rem', cursor: 'pointer' }}>
            {value ? 'Change photo' : 'Upload photo'}
          </button>
          <p style={{ fontSize: '0.72rem', opacity: 0.4, margin: '0.4rem 0 0', lineHeight: 1.5 }}>
            {value ? 'Looking good. You can change this later.' : 'You can always update this later from your profile.'}
          </p>
        </div>
      </div>
    </>
  )
}

// ── Sections ──────────────────────────────────────────────────────────────────

// ── File upload (admin-added "File upload" fields) ───────────────────────────

// File answers store an /api/apply/file href (or, pre-072, a public storage
// URL) — the shared helpers understand both forms.
const fileNameFromUrl = (url: string) => applicationFileName(url)

function ApplicationFileUpload({ value, onChange }: { value: string; onChange: (url: string) => void }) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ref = useRef<HTMLInputElement>(null)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/apply/file', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Upload failed'); setUploading(false); return }
      onChange(data.url)
    } catch {
      setError('Something went wrong. Please try again.')
    }
    setUploading(false)
  }

  return (
    <div>
      <input ref={ref} type="file" style={{ display: 'none' }} onChange={handleFile} />
      {value ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <a href={applicationFileHref(value)} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: GOLD, fontSize: '0.85rem', textDecoration: 'none', maxWidth: '100%', overflow: 'hidden' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" style={{ flexShrink: 0 }}>
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
            </svg>
            <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{fileNameFromUrl(value)}</span>
          </a>
          <button type="button" onClick={() => ref.current?.click()} disabled={uploading} style={{ padding: '0.35rem 0.85rem', borderRadius: '9999px', border: '1px solid rgb(var(--gold-rgb) / 0.3)', background: 'transparent', color: GOLD, fontSize: '0.75rem', cursor: uploading ? 'not-allowed' : 'pointer' }}>
            {uploading ? 'Uploading…' : 'Replace'}
          </button>
          <button type="button" onClick={() => onChange('')} disabled={uploading} style={{ background: 'none', border: 'none', color: 'var(--danger)', opacity: 0.6, fontSize: '0.8rem', cursor: 'pointer' }}>Remove</button>
        </div>
      ) : (
        <button type="button" onClick={() => ref.current?.click()} disabled={uploading} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.55rem 1.1rem', borderRadius: '9999px', border: '1px dashed rgb(var(--gold-rgb) / 0.35)', background: 'transparent', color: GOLD, fontSize: '0.82rem', cursor: uploading ? 'not-allowed' : 'pointer' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          {uploading ? 'Uploading…' : 'Upload file'}
        </button>
      )}
      <p style={{ fontSize: '0.72rem', opacity: 0.4, margin: '0.4rem 0 0' }}>Images, PDF, Word, or text — up to 10 MB.</p>
      {error && <p style={{ fontSize: '0.78rem', color: 'var(--danger)', margin: '0.35rem 0 0' }}>{error}</p>}
    </div>
  )
}

// ── Modular section renderer (config-driven, width-paired) ───────────────────
//
// Renders a section's fields in config order, reusing the same primitives as the
// hand-written sections. Consecutive `half` fields pair into a two-column row; an
// unpaired `half` (or any `full`) takes the whole row. Built-in fields render via
// the descriptor registry; admin-added fields render by their `type`.

// Built-in steps rendered by the config-driven ModularSection (all of them).
const MODULAR_STEP_KEYS = ['basic', 'registry', 'plans', 'roles', 'agreement', 'shrimp']

type FieldDescriptor = {
  widget: 'text' | 'email' | 'tel' | 'date' | 'radio' | 'checkbox' | 'textarea' | 'photo' | 'agreement'
  placeholder?: string
  // When set, the field's own description is used as the placeholder (falling
  // back to this value) instead of being rendered as a separate paragraph.
  descPlaceholder?: string
  maxLength?: number
  options?: string[]
  // Options resolved at runtime from `optionSources[field.key]` (attendance,
  // contribution types, agreement items, departments…).
  optionsFromSource?: boolean
  // FormData key when it differs from the field key (e.g. dept_interests).
  formKey?: keyof FormData
}

// Built-in field descriptors, keyed by field key.
const FIELD_DESCRIPTORS: Record<string, FieldDescriptor> = {
  // Basic Information
  first_name:        { widget: 'text', placeholder: 'First name', maxLength: 50 },
  last_name:         { widget: 'text', placeholder: 'Last name', maxLength: 50 },
  preferred_name:    { widget: 'text', placeholder: 'If different', maxLength: 50 },
  pronouns:          { widget: 'text', placeholder: 'e.g. she/her' },
  email:             { widget: 'email', placeholder: 'your@email.com' },
  phone:             { widget: 'tel', placeholder: 'For camp logistics' },
  instagram:         { widget: 'text', descPlaceholder: '@handle' },
  location:          { widget: 'text', placeholder: "City, region, or 'the void'" },
  emergency_contact: { widget: 'text', descPlaceholder: 'Name and phone number' },
  referral:          { widget: 'text', placeholder: 'Name or how you found us' },
  camped_before:     { widget: 'radio', options: ['Yes', 'No'] },
  avatar_url:        { widget: 'photo' },
  // Many Hands Registry
  about_you:            { widget: 'textarea', placeholder: 'Share the projects, ideas, pursuits, or obsessions lighting you up right now.' },
  special_skills:       { widget: 'textarea', placeholder: 'Your answer…' },
  find_at_camp:         { widget: 'textarea', placeholder: 'Your answer…' },
  community_acceptance: { widget: 'radio', options: ['Yes', 'Not Yet', "It's Complicated"] },
  onboarding_status:    { widget: 'radio', options: ['Emerging', 'Stable', 'Elevated', 'Classified', 'Other'] },
  // What If Plans
  attendance:     { widget: 'radio', optionsFromSource: true },
  arrival_date:   { widget: 'date' },
  departure_date: { widget: 'date' },
  vehicle:        { widget: 'text', descPlaceholder: 'Make, model, passengers, cargo capacity' },
  structures:     { widget: 'text', descPlaceholder: 'Tents, shade structures, etc.' },
  rideshare:      { widget: 'radio', options: ['I need a ride', 'I can offer a ride', "I'm sorted", 'Not sure yet'] },
  // Participation & Roles
  dept_interests:      { widget: 'checkbox', optionsFromSource: true, formKey: 'department_interests' },
  leadership_interest: { widget: 'radio', options: ['Yes', 'Maybe', 'Not this year'] },
  setup_preference:    { widget: 'checkbox', optionsFromSource: true },
  setup_limitations:   { widget: 'checkbox', options: ['None', 'Unable to participate in setup', 'Unable to participate in teardown', 'Unable to participate in either', 'Prefer to discuss privately'] },
  setup_notes:         { widget: 'textarea', placeholder: 'Your answer…', maxLength: 800 },
  // The Many Hands Agreement — clauses come from the field's editable `options`
  // (falling back to the legacy member_acknowledgements source if unset).
  acknowledgements:    { widget: 'agreement' },
  // Shrimp
  shrimp_relationship: { widget: 'textarea', placeholder: 'Reflect carefully. There are no wrong answers. There are, however, better ones.', maxLength: 500 },
}

function isPhotoField(field: FieldConfig): boolean {
  return FIELD_DESCRIPTORS[field.key]?.widget === 'photo'
}

// Layout elements and the photo uploader are never paired into a two-column row.
function isFullBleed(field: FieldConfig): boolean {
  return !!field.element || isPhotoField(field)
}

type OptionSources = Record<string, string[]>

// A list of statements/clauses to acknowledge (Many Hands Agreement style) with a
// "N items remaining" nudge. All items must be checked when the field is required.
// Rich-text rendering for text-block elements lives in lib/markdown-lite (RichText).

function AgreementChecklist({ options, value, onChange }: { options: string[]; value: string[]; onChange: (v: string[]) => void }) {
  const remaining = options.length - value.length
  return (
    <>
      <CheckboxGroup options={options} value={value} onChange={onChange} />
      {value.length > 0 && remaining > 0 && (
        <p style={{ fontSize: '0.78rem', color: GOLD, opacity: 0.5, marginTop: '1rem', fontStyle: 'italic' }}>
          {remaining} item{remaining !== 1 ? 's' : ''} remaining
        </p>
      )}
    </>
  )
}

type SelectableGroup = { id: string; name: string; description: string | null }

// Checklist of admin-defined groups the applicant can opt into. Stores group ids.
function GroupChecklist({ groups, value, onChange }: { groups: SelectableGroup[]; value: string[]; onChange: (v: string[]) => void }) {
  if (groups.length === 0) {
    return <p style={{ fontSize: '0.82rem', opacity: 0.4, fontStyle: 'italic', margin: 0 }}>No groups are open for sign-up right now.</p>
  }
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter(v => v !== id) : [...value, id])
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {groups.map(g => {
        const checked = value.includes(g.id)
        return (
          <label key={g.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', cursor: 'pointer', padding: '0.65rem 0.85rem', borderRadius: '0.5rem', border: `1px solid ${checked ? 'rgb(var(--gold-rgb) / 0.4)' : 'rgb(var(--gold-rgb) / 0.15)'}`, background: checked ? 'rgb(var(--gold-rgb) / 0.06)' : 'rgba(255,255,255,0.02)' }}>
            <input type="checkbox" checked={checked} onChange={() => toggle(g.id)} style={{ marginTop: '0.2rem', accentColor: GOLD }} />
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: '0.9rem', color: CREAM }}>{g.name}</span>
              {g.description && <span style={{ display: 'block', fontSize: '0.78rem', opacity: 0.5, marginTop: '0.15rem', lineHeight: 1.5 }}>{g.description}</span>}
            </span>
          </label>
        )
      })}
    </div>
  )
}

// Renders the input control for a single field (without the Field label wrapper).
function FieldControl({ field, form, set, answers, setAnswer, optionSources, groups }: {
  field: FieldConfig
  form: FormData
  set: (k: keyof FormData, v: unknown) => void
  answers: Record<string, string | string[]>
  setAnswer: (key: string, val: string | string[]) => void
  optionSources: OptionSources
  groups: SelectableGroup[]
}) {
  const d = FIELD_DESCRIPTORS[field.key]

  // Admin-added custom field → render by its declared type, bound to custom_answers.
  if (!d) {
    // Group selection writes to group_choices (top-level), not custom_answers,
    // so /api/apply can create the memberships. The field's `options` hold the
    // group ids it offers (unset ⇒ all groups); groups themselves come from the DB.
    if (field.type === 'group_select') {
      const ids = field.options
      const shown = ids === undefined ? groups : groups.filter(g => ids.includes(g.id))
      return <GroupChecklist groups={shown} value={form.group_choices} onChange={v => set('group_choices', v)} />
    }
    if (field.type === 'textarea')
      return <Textarea value={(answers[field.key] as string) ?? ''} onChange={v => setAnswer(field.key, v)} placeholder="Your answer…" />
    if (field.type === 'radio' && field.options) {
      const val = (answers[field.key] as string) ?? ''
      const other = field.options.find(o => o.trim().toLowerCase() === 'other')
      return (
        <>
          <RadioGroup options={field.options} value={val} onChange={v => setAnswer(field.key, v)} />
          {other && val === other && (
            <div style={{ marginTop: '0.5rem' }}>
              <Input value={(answers[field.key + '__other'] as string) ?? ''} onChange={v => setAnswer(field.key + '__other', v)} placeholder="Please specify…" />
            </div>
          )}
        </>
      )
    }
    if (field.type === 'checkbox' && field.options) {
      const vals = (answers[field.key] as string[]) ?? []
      const other = field.options.find(o => o.trim().toLowerCase() === 'other')
      return (
        <>
          <CheckboxGroup options={field.options} value={vals} onChange={v => setAnswer(field.key, v as string[])} />
          {other && vals.includes(other) && (
            <div style={{ marginTop: '0.5rem' }}>
              <Input value={(answers[field.key + '__other'] as string) ?? ''} onChange={v => setAnswer(field.key + '__other', v)} placeholder="Please specify…" />
            </div>
          )}
        </>
      )
    }
    if (field.type === 'agreement')
      return <AgreementChecklist options={field.options ?? []} value={(answers[field.key] as string[]) ?? []} onChange={v => setAnswer(field.key, v)} />
    if (field.type === 'file')
      return <ApplicationFileUpload value={(answers[field.key] as string) ?? ''} onChange={v => setAnswer(field.key, v)} />
    return <Input value={(answers[field.key] as string) ?? ''} onChange={v => setAnswer(field.key, v)} placeholder="Your answer…" />
  }

  const key = (d.formKey ?? field.key) as keyof FormData
  const options = d.optionsFromSource ? (optionSources[field.key] ?? []) : (d.options ?? [])

  if (d.widget === 'agreement') {
    // Clauses come from the field's editable options, falling back to the legacy
    // source (member_acknowledgements) for configs saved before they were editable.
    const clauses = field.options?.length ? field.options : (optionSources[field.key] ?? [])
    return <AgreementChecklist options={clauses} value={(form[key] as string[]) ?? []} onChange={v => set(key, v as string[])} />
  }

  if (d.widget === 'textarea')
    return <Textarea value={(form[key] as string) ?? ''} onChange={v => set(key, v)} placeholder={d.placeholder} maxLength={d.maxLength} />

  if (d.widget === 'checkbox') {
    return <CheckboxGroup options={options} value={(form[key] as string[]) ?? []} onChange={v => set(key, v as string[])} />
  }

  if (d.widget === 'radio') {
    // onboarding_status reveals a free-text field when "Other" is selected.
    if (field.key === 'onboarding_status') {
      return (
        <>
          <RadioGroup options={options} value={(form[key] as string) ?? ''} onChange={v => set(key, v)} />
          {form.onboarding_status === 'Other' && (
            <div style={{ marginTop: '0.5rem' }}>
              <Input value={form.onboarding_status_other} onChange={v => set('onboarding_status_other', v)} placeholder="Tell us more…" />
            </div>
          )}
        </>
      )
    }
    return <RadioGroup options={options} value={(form[key] as string) ?? ''} onChange={v => set(key, v)} />
  }

  const placeholder = d.descPlaceholder ? (field.description || d.descPlaceholder) : d.placeholder
  const inputType = d.widget === 'text' ? 'text' : d.widget
  return (
    <Input
      value={(form[key] as string) ?? ''}
      onChange={v => set(key, v)}
      type={inputType}
      placeholder={placeholder}
      maxLength={d.maxLength}
      readOnly={field.key === 'email' ? !!form.email : false}
    />
  )
}

// Renders one entry: a layout element (divider/paragraph), the photo block, or a
// labelled input cell.
function FieldCell({ field, form, set, answers, setAnswer, optionSources, groups }: {
  field: FieldConfig
  form: FormData
  set: (k: keyof FormData, v: unknown) => void
  answers: Record<string, string | string[]>
  setAnswer: (key: string, val: string | string[]) => void
  optionSources: OptionSources
  groups: SelectableGroup[]
}) {
  if (field.element === 'divider') {
    return <Divider label={field.label || undefined} />
  }
  if (field.element === 'paragraph') {
    return <RichText text={field.description ?? ''} />
  }

  if (isPhotoField(field)) {
    return (
      <>
        <Divider label={`${field.label}${field.required ? ' *' : ''}`} />
        {field.description && (
          <p style={{ fontSize: '0.85rem', lineHeight: 1.8, opacity: 0.5, marginBottom: '1.25rem' }}>
            Please upload a photo for the Many Hands Photo Board. A photo where people can reasonably tell it&apos;s you is appreciated.
          </p>
        )}
        <PhotoUpload value={form.avatar_url} onChange={url => set('avatar_url', url)} />
      </>
    )
  }
  return (
    <Field label={field.label} required={field.required} optional={!field.required}>
      {field.description && FIELD_DESCRIPTORS[field.key]?.descPlaceholder === undefined && (
        <p style={{ fontSize: '0.8rem', opacity: 0.4, margin: '0 0 0.5rem', fontStyle: 'italic' }}>{field.description}</p>
      )}
      <FieldControl field={field} form={form} set={set} answers={answers} setAnswer={setAnswer} optionSources={optionSources} groups={groups} />
    </Field>
  )
}

function ModularSection({ step, form, set, answers, setAnswer, optionSources, isMobile, requiredHint, groups }: {
  step: StepConfig
  form: FormData
  set: (k: keyof FormData, v: unknown) => void
  answers: Record<string, string | string[]>
  setAnswer: (key: string, val: string | string[]) => void
  optionSources: OptionSources
  isMobile?: boolean
  requiredHint?: boolean
  groups: SelectableGroup[]
}) {
  // `setup_preference` (the old contributions multi-select) is retired — groups
  // replace it (admin-assigned + the optional `group_select` field admins can add).
  // Filtered here so it never renders even if a saved config still lists it.
  const visible = step.fields.filter(f => f.visible && f.key !== 'setup_preference')

  // Group consecutive `half` fields into two-column rows (greedy pairing).
  const rows: FieldConfig[][] = []
  for (let i = 0; i < visible.length; i++) {
    const f = visible[i]
    const canPair = !isMobile && (f.width ?? 'full') === 'half' && !isFullBleed(f)
    const next = visible[i + 1]
    const nextCanPair = next && !isMobile && (next.width ?? 'full') === 'half' && !isFullBleed(next)
    if (canPair && nextCanPair) {
      rows.push([f, next])
      i++
    } else {
      rows.push([f])
    }
  }

  const cellProps = { form, set, answers, setAnswer, optionSources, groups }

  return (
    <>
      {requiredHint && (
        <p style={{ fontSize: '0.72rem', opacity: 0.4, textAlign: 'right', marginBottom: '1rem', marginTop: '-0.5rem' }}>
          <span style={{ color: 'var(--danger)' }}>*</span> required
        </p>
      )}
      {rows.map((row, i) =>
        row.length === 2 ? (
          <div key={i} className="mobile-stack" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            {row.map(f => <FieldCell key={f.key} field={f} {...cellProps} />)}
          </div>
        ) : (
          <FieldCell key={row[0].key} field={row[0]} {...cellProps} />
        )
      )}
    </>
  )
}

// ── Main wizard ───────────────────────────────────────────────────────────────

export function ApplyWizard({ userEmail, formConfig, agreementItems, attendanceOptions, contributionTypes, selectableGroups = [], initialStep = 0 }: {
  userEmail: string
  formConfig: MemberFormConfig
  agreementItems?: string[]
  attendanceOptions?: string[]
  contributionTypes?: ContributionType[]
  // Groups the applicant can optionally opt into (admin-toggled per group).
  selectableGroups?: SelectableGroup[]
  // Dev/preview only: forces the starting step so a given section can be
  // server-rendered for verification. Real /apply usage leaves this at 0.
  initialStep?: number
}) {
  const resolvedAgreementItems = agreementItems ?? AGREEMENT_ITEMS_FALLBACK
  const resolvedAttendanceOptions = attendanceOptions ?? ['Camping on site', 'Staying nearby but participating', 'Mostly visiting socially', 'Still figuring it out']
  const resolvedContributionTypes = contributionTypes ?? DEFAULT_CONTRIBUTION_TYPES
  // Runtime option sources for descriptor-driven fields (keyed by field key).
  const optionSources: OptionSources = {
    attendance: resolvedAttendanceOptions,
    dept_interests: DEPT_OPTIONS,
    setup_preference: resolvedContributionTypes.map(t => t.value),
    acknowledgements: resolvedAgreementItems,
  }
  const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']
  const steps = formConfig.steps.filter(s => s.visible)
  const lastStep = steps.length - 1

  const [step, setStep] = useState(initialStep)
  const [form, setFormState] = useState<FormData>({ ...BLANK, email: userEmail })
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [draftSaved, setDraftSaved] = useState<Date | null>(null)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY)
      if (raw) {
        const saved = JSON.parse(raw)
        setFormState(prev => ({ ...prev, ...saved, email: userEmail }))
        // Clamp the restored step — the admin may have removed/hidden sections
        // since this draft was saved, and an out-of-range step crashes the render.
        setStep(Math.min(Math.max(0, saved.__step ?? 0), lastStep))
      }
    } catch { /* ignore */ }

    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [userEmail])

  function set(k: keyof FormData, v: unknown) {
    setFormState(prev => {
      const next = { ...prev, [k]: v }
      try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...next, __step: step })) } catch { /* ignore */ }
      setDraftSaved(new Date())
      return next
    })
  }

  function goTo(s: number) {
    setStep(s)
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...form, __step: s })) } catch { /* ignore */ }
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // Every visible+required field on the current step must have an answer —
  // built-in fields check their FormData slot (via the descriptor's formKey),
  // custom fields check custom_answers. Special cases: agreement checklists
  // need every clause checked; group selection reads group_choices (and can't
  // block when the field offers no groups); the photo block checks avatar_url.
  function canContinue() {
    const currentStep = steps[step]
    if (!currentStep) return true
    return currentStep.fields
      .filter(f => f.visible && f.required && !f.element && f.key !== 'setup_preference')
      .every(f => {
        if (f.type === 'group_select') {
          const shown = f.options === undefined || f.options === null
            ? selectableGroups
            : selectableGroups.filter(g => f.options!.includes(g.id))
          return shown.length === 0 || form.group_choices.length > 0
        }
        const d = FIELD_DESCRIPTORS[f.key]
        if (!d) {
          const val = form.custom_answers[f.key]
          if (f.type === 'agreement') return Array.isArray(val) && val.length === (f.options?.length ?? 0)
          // "Other" selected on a single/multi-choice field isn't a real answer
          // until its fill-in text (stored at `key + '__other'`) is non-empty.
          const other = f.options?.find(o => o.trim().toLowerCase() === 'other')
          if (other && f.type === 'radio' && val === other) {
            return !!(form.custom_answers[f.key + '__other'] as string)?.trim()
          }
          if (other && f.type === 'checkbox' && Array.isArray(val) && val.includes(other)) {
            return !!(form.custom_answers[f.key + '__other'] as string)?.trim()
          }
          return Array.isArray(val) ? val.length > 0 : !!(val as string)?.trim()
        }
        if (d.widget === 'photo') return !!form.avatar_url
        if (d.widget === 'agreement') {
          const clauses = f.options?.length ? f.options : (optionSources[f.key] ?? [])
          return form.acknowledgements.length === clauses.length
        }
        // onboarding_status reveals a free-text field when "Other" is selected
        // (see FieldControl) — require it filled before counting as answered.
        if (f.key === 'onboarding_status' && form.onboarding_status === 'Other') {
          return !!form.onboarding_status_other.trim()
        }
        const val = form[(d.formKey ?? f.key) as keyof FormData]
        return Array.isArray(val) ? val.length > 0 : !!(typeof val === 'string' ? val.trim() : val)
      })
  }

  async function handleSubmit() {
    setSubmitting(true)
    setError(null)
    try {
      // Phase 3: registry-bound fields write their answers to the canonical member
      // profile. Collect { [registryKey]: answer } for every bound field that has
      // a non-empty answer (custom-field answers live in custom_answers[field.key]).
      const profile_values: Record<string, string | string[]> = {}
      for (const s of formConfig.steps) {
        for (const f of s.fields) {
          if (!f.profileFieldKey) continue
          const v = form.custom_answers[f.key]
          if (v === undefined || v === '' || (Array.isArray(v) && v.length === 0)) continue
          profile_values[f.profileFieldKey] = v
        }
      }
      const res = await fetch('/api/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          onboarding_status: form.onboarding_status ? [form.onboarding_status] : [],
          profile_values,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error); setSubmitting(false); return }
      try { localStorage.removeItem(DRAFT_KEY) } catch { /* ignore */ }
      setSubmitted(true)
    } catch {
      setError('Something went wrong. Please try again.')
    }
    setSubmitting(false)
  }

  if (submitted) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
        <div style={{ textAlign: 'center', maxWidth: '500px' }}>
          <p style={{ fontFamily: 'var(--font-display)', fontSize: '2.5rem', color: GOLD, marginBottom: '0.5rem', textShadow: '0 0 40px rgb(var(--gold-rgb) / 0.4)' }}>✦</p>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.8rem, 5vw, 2.5rem)', color: GOLD, marginBottom: '1rem' }}>Application Received</h1>
          <p style={{ fontSize: '0.95rem', lineHeight: 1.8, opacity: 0.55, marginBottom: '2rem' }}>
            Thank you for applying to Glåüm. Your application is under review. We'll be in touch.
          </p>
          <a href="/profile" style={{ padding: '0.75rem 2rem', borderRadius: '9999px', border: '1px solid rgb(var(--gold-rgb) / 0.5)', color: GOLD, textDecoration: 'none', fontSize: '0.85rem', letterSpacing: '0.1em' }}>
            Go to your profile →
          </a>
        </div>
      </div>
    )
  }

  const sidebar = (
    <div style={{
      width: isMobile ? '100%' : '200px',
      flexShrink: 0,
      background: 'rgba(10,3,18,0.55)',
      backdropFilter: 'blur(0px)',
      borderRight: isMobile ? 'none' : '1px solid rgb(var(--gold-rgb) / 0.12)',
      borderBottom: isMobile ? '1px solid rgb(var(--gold-rgb) / 0.12)' : 'none',
      display: 'flex', flexDirection: isMobile ? 'row' : 'column',
      padding: isMobile ? '0.75rem 1rem' : '2.5rem 0 2rem',
      overflowX: isMobile ? 'auto' : 'visible',
    }}>
      {!isMobile && (
        <div style={{ padding: '0 1.5rem 2rem', textAlign: 'center', borderBottom: '1px solid rgb(var(--gold-rgb) / 0.1)', marginBottom: '1.5rem' }}>
          <p style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', color: GOLD, margin: '0 0 0.1rem', letterSpacing: '0.06em' }}>Glåüm</p>
          <p style={{ fontSize: '0.55rem', letterSpacing: '0.22em', textTransform: 'uppercase', color: GOLD, opacity: 0.45, margin: 0 }}>APPLICATION FOR MEMBERSHIP</p>
        </div>
      )}

      {steps.map((s, i) => {
        const active = i === step
        const done = i < step
        return (
          <button
            key={i}
            onClick={() => i < step && goTo(i)}
            style={{
              display: 'flex', alignItems: isMobile ? 'center' : 'flex-start',
              gap: isMobile ? '0' : '0.85rem',
              padding: isMobile ? '0.35rem 0.6rem' : '0.7rem 1.5rem',
              background: 'none', border: 'none',
              borderLeft: isMobile ? 'none' : `3px solid ${active ? GOLD : 'transparent'}`,
              cursor: i < step ? 'pointer' : 'default',
              textAlign: 'left', flexShrink: 0,
            }}
          >
            <div style={{
              width: isMobile ? '26px' : '22px',
              height: isMobile ? '26px' : '22px',
              borderRadius: '50%', flexShrink: 0,
              border: `1.5px solid ${active ? GOLD : done ? 'rgb(var(--gold-rgb) / 0.4)' : 'rgb(var(--gold-rgb) / 0.2)'}`,
              background: active ? 'rgb(var(--gold-rgb) / 0.12)' : 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '0.58rem', color: active ? GOLD : done ? 'rgb(var(--gold-rgb) / 0.6)' : 'rgb(var(--gold-rgb) / 0.35)',
              letterSpacing: '0.02em', fontWeight: active ? 700 : 400,
            }}>
              {done ? '✓' : (ROMAN[i] ?? s.num)}
            </div>
            {!isMobile && (
              <div style={{ opacity: active ? 1 : done ? 0.5 : 0.28 }}>
                <p style={{ fontSize: '0.68rem', letterSpacing: '0.1em', color: active ? GOLD : CREAM, margin: '0 0 0.1rem', fontWeight: active ? 700 : 400 }}>{s.title}</p>
                <p style={{ fontSize: '0.65rem', color: CREAM, margin: 0, opacity: 0.6 }}>{s.subtitle}</p>
              </div>
            )}
          </button>
        )
      })}

      {!isMobile && (
        <div style={{ marginTop: 'auto', padding: '2rem 1.5rem 0', borderTop: '1px solid rgb(var(--gold-rgb) / 0.1)' }}>
          <p style={{ fontFamily: 'var(--font-display)', fontSize: '0.75rem', color: GOLD, opacity: 0.35, textAlign: 'center', lineHeight: 1.5, margin: 0 }}>MANY HANDS<br />MAKE LIGHT WORK</p>
        </div>
      )}
    </div>
  )

  const mainContent = (
    <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '1.5rem 1.25rem 6rem' : '3rem 3rem 6rem', maxWidth: '720px', width: '100%', margin: '0 auto' }}>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1.5rem', minHeight: '1rem' }}>
        {draftSaved && (
          <p style={{ fontSize: '0.68rem', letterSpacing: '0.1em', color: GOLD, opacity: 0.35, margin: 0 }}>
            DRAFT SAVED • {draftSaved.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
        )}
      </div>

      <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
        <p style={{ fontSize: '0.62rem', letterSpacing: '0.3em', textTransform: 'uppercase', color: PURPLE, opacity: 0.65, margin: '0 0 0.4rem' }}>
          SECTION {ROMAN[step] ?? steps[step].num} OF {ROMAN[steps.length - 1] ?? steps[steps.length - 1].num}
        </p>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.6rem, 4vw, 2.4rem)', color: GOLD, margin: '0 0 0.5rem', letterSpacing: '0.08em', textShadow: '0 0 30px rgb(var(--gold-rgb) / 0.3)' }}>
          {steps[step].title}
        </h1>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', margin: '0.5rem 0' }}>
          <div style={{ height: '1px', width: '40px', background: 'linear-gradient(90deg, transparent, rgb(var(--gold-rgb) / 0.4))' }} />
          <span style={{ color: GOLD, opacity: 0.4, fontSize: '0.65rem' }}>✦</span>
          <div style={{ height: '1px', width: '40px', background: 'linear-gradient(90deg, rgb(var(--gold-rgb) / 0.4), transparent)' }} />
        </div>
        <p style={{ fontSize: '0.8rem', color: CREAM, opacity: 0.4, margin: 0, letterSpacing: '0.05em' }}>{steps[step].subtitle}</p>
      </div>

      {/* Section progress — one node per visible section (numeral below), advances with the step */}
      {steps.length > 1 && (
        <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: '2.5rem' }}>
          {steps.map((s, i) => {
            const done = i < step
            const active = i === step
            return (
              <div key={s.key} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                  {i > 0 && <div style={{ flex: 1, height: '1px', background: i <= step ? 'rgb(var(--gold-rgb) / 0.45)' : 'rgb(var(--gold-rgb) / 0.12)' }} />}
                  <div style={{
                    width: '20px', height: '20px', borderRadius: '50%', flexShrink: 0,
                    border: `${active ? 2 : 1.5}px solid ${done ? 'rgb(var(--gold-rgb) / 0.6)' : active ? GOLD : 'rgb(var(--gold-rgb) / 0.2)'}`,
                    background: done ? 'rgb(var(--gold-rgb) / 0.18)' : active ? 'rgb(var(--gold-rgb) / 0.12)' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.3s',
                  }}>
                    {done && <span style={{ fontSize: '0.55rem', color: GOLD, opacity: 0.85 }}>✓</span>}
                    {active && <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: GOLD }} />}
                  </div>
                  {i < steps.length - 1 && <div style={{ flex: 1, height: '1px', background: i < step ? 'rgb(var(--gold-rgb) / 0.45)' : 'rgb(var(--gold-rgb) / 0.12)' }} />}
                </div>
                <p style={{ fontSize: '0.6rem', letterSpacing: '0.1em', color: GOLD, opacity: active ? 0.9 : done ? 0.5 : 0.3, margin: '0.45rem 0 0' }}>
                  {ROMAN[i] ?? String(i + 1)}
                </p>
              </div>
            )
          })}
        </div>
      )}

      {/* Form content */}
      <div style={{ marginBottom: '3rem' }}>
        {/* Modular (config-driven) sections + all custom steps */}
        {steps[step] && (MODULAR_STEP_KEYS.includes(steps[step].key) || steps[step].isCustom) && (
          <ModularSection
            step={steps[step]}
            form={form}
            set={set}
            answers={form.custom_answers}
            setAnswer={(k, v) => set('custom_answers', { ...form.custom_answers, [k]: v })}
            optionSources={optionSources}
            isMobile={isMobile}
            requiredHint={steps[step].key === 'basic'}
            groups={selectableGroups}
          />
        )}
      </div>

      {error && (
        <p style={{ color: 'var(--danger)', fontSize: '0.85rem', marginBottom: '1rem', textAlign: 'center' }}>{error}</p>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '1.5rem', borderTop: '1px solid rgb(var(--gold-rgb) / 0.1)' }}>
        <button
          onClick={() => step > 0 ? goTo(step - 1) : undefined}
          style={{
            padding: '0.75rem 1.75rem', borderRadius: '9999px',
            border: '1px solid rgb(var(--gold-rgb) / 0.25)', background: 'transparent',
            color: CREAM, cursor: step > 0 ? 'pointer' : 'default', fontSize: '0.82rem',
            letterSpacing: '0.08em', opacity: step > 0 ? 0.75 : 0.2,
          }}
        >
          ← PREVIOUS SECTION
        </button>

        {step < lastStep ? (
          <button
            onClick={() => canContinue() && goTo(step + 1)}
            disabled={!canContinue()}
            style={{
              padding: '0.75rem 2.5rem', borderRadius: '9999px',
              border: 'none', background: canContinue() ? 'linear-gradient(135deg, var(--gold), var(--gold-deep))' : 'rgb(var(--gold-rgb) / 0.2)',
              color: canContinue() ? '#1A0A00' : 'rgb(var(--gold-rgb) / 0.5)',
              cursor: canContinue() ? 'pointer' : 'not-allowed', fontSize: '0.85rem',
              letterSpacing: '0.1em', fontWeight: 600,
              transition: 'all 0.2s',
            }}
          >
            CONTINUE →
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={submitting || !canContinue()}
            style={{
              padding: '0.75rem 2.5rem', borderRadius: '9999px',
              border: 'none', background: (submitting || !canContinue()) ? 'rgb(var(--gold-rgb) / 0.2)' : 'linear-gradient(135deg, var(--gold), var(--gold-deep))',
              color: (submitting || !canContinue()) ? 'rgb(var(--gold-rgb) / 0.5)' : '#1A0A00',
              cursor: (submitting || !canContinue()) ? 'not-allowed' : 'pointer', fontSize: '0.85rem',
              letterSpacing: '0.1em', fontWeight: 600,
            }}
          >
            {submitting ? 'SUBMITTING…' : 'SUBMIT APPLICATION'}
          </button>
        )}
      </div>

      <p style={{ textAlign: 'center', marginTop: '1.25rem', fontSize: '0.78rem', opacity: 0.4 }}>
        Your progress is saved automatically.{' '}
        <a href="/profile" style={{ color: GOLD, opacity: 0.8, textDecoration: 'underline', textUnderlineOffset: '2px' }}>
          Save and Exit
        </a>
      </p>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: isMobile ? 'column' : 'row', color: CREAM }}>
      {sidebar}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', justifyContent: 'center' }}>
        {mainContent}
      </div>
    </div>
  )
}
