'use client'

import { HandsBackdrop } from '@/components/HandsBackdrop'
import { useState, useRef, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import type { VolunteerFormConfig } from '@/lib/form-config'

const inputStyle: React.CSSProperties = {
  width: '100%',
  backgroundColor: 'rgba(255,255,255,0.05)',
  border: '1px solid rgb(var(--gold-rgb) / 0.25)',
  borderRadius: '0.5rem',
  padding: '0.75rem 1rem',
  color: 'var(--cream)',
  fontSize: '0.95rem',
  fontFamily: 'var(--font-libre-baskerville), Georgia, serif',
  outline: 'none',
  transition: 'border-color 0.2s',
  boxSizing: 'border-box',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.75rem',
  letterSpacing: '0.12em',
  color: 'var(--gold)',
  marginBottom: '0.5rem',
  textTransform: 'uppercase',
}

const fieldStyle: React.CSSProperties = { marginBottom: '1.75rem' }

const dividerStyle: React.CSSProperties = {
  height: '1px',
  background: 'linear-gradient(90deg, transparent, rgb(var(--gold-rgb) / 0.3), transparent)',
  margin: '2.5rem 0',
}

function Field({ label, children, optional }: { label: string; children: React.ReactNode; optional?: boolean }) {
  return (
    <div style={fieldStyle}>
      <label style={labelStyle}>
        {label}
        {optional && <span style={{ opacity: 0.45, marginLeft: '0.4rem', textTransform: 'none', letterSpacing: 0, fontSize: '0.72rem' }}>(optional)</span>}
      </label>
      {children}
    </div>
  )
}

function TextInput({ name, placeholder, type = 'text', required, defaultValue, readOnly }: {
  name: string; placeholder?: string; type?: string; required?: boolean; defaultValue?: string; readOnly?: boolean
}) {
  return (
    <input
      type={type}
      name={name}
      placeholder={placeholder}
      required={required}
      defaultValue={defaultValue}
      readOnly={readOnly}
      style={{ ...inputStyle, ...(readOnly ? { opacity: 0.55, cursor: 'default' } : {}) }}
      onFocus={e => { if (!readOnly) e.currentTarget.style.borderColor = 'rgb(var(--purple-rgb) / 0.6)' }}
      onBlur={e => { e.currentTarget.style.borderColor = 'rgb(var(--gold-rgb) / 0.25)' }}
    />
  )
}

function TextArea({ name, placeholder, rows = 3 }: { name: string; placeholder?: string; rows?: number }) {
  return (
    <textarea
      name={name}
      placeholder={placeholder}
      rows={rows}
      style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }}
      onFocus={e => { e.currentTarget.style.borderColor = 'rgb(var(--purple-rgb) / 0.6)' }}
      onBlur={e => { e.currentTarget.style.borderColor = 'rgb(var(--gold-rgb) / 0.25)' }}
    />
  )
}

const SIGNUP_INTENT_OPTIONS = [
  { value: 'shift',  label: 'Sign up for a shift',   desc: 'Help out during a specific time slot.' },
  { value: 'role',   label: 'Take on a camp role',    desc: 'Take on a defined responsibility for the event.' },
  { value: 'other',  label: 'Something else',          desc: "I'm not sure yet, or I have something else in mind." },
]

const DAYS = ['Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'Monday', 'Flexible']

// Field lookup helper
function makeFlHelper(formConfig: VolunteerFormConfig) {
  return {
    visible:  (key: string) => formConfig.fields.find(f => f.key === key)?.visible ?? true,
    required: (key: string) => formConfig.fields.find(f => f.key === key)?.required ?? false,
    label:    (key: string) => formConfig.fields.find(f => f.key === key)?.label ?? key,
    desc:     (key: string) => formConfig.fields.find(f => f.key === key)?.description,
  }
}

export function VolunteerForm({ userEmail, userFirstName, userLastName, formConfig }: {
  userEmail: string
  userFirstName: string
  userLastName: string
  formConfig: VolunteerFormConfig
}) {
  const router = useRouter()
  const fl = makeFlHelper(formConfig)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [otherChecked, setOtherChecked] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const avatarInputRef = useRef<HTMLInputElement>(null)

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setAvatarPreview(URL.createObjectURL(file))
    setAvatarUploading(true)
    const fd = new FormData()
    fd.append('avatar', file)
    const res = await fetch('/api/profile/avatar', { method: 'POST', body: fd })
    const json = await res.json()
    if (res.ok) setAvatarUrl(json.avatarUrl)
    setAvatarUploading(false)
    if (avatarInputRef.current) avatarInputRef.current.value = ''
  }

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    if (fl.visible('avatar_url') && fl.required('avatar_url') && !avatarUrl) {
      setError('Please upload a photo before submitting.')
      setSubmitting(false)
      return
    }

    const form = new FormData(e.currentTarget)

    const data = {
      first_name:      form.get('first_name'),
      last_name:       form.get('last_name'),
      preferred_name:  form.get('preferred_name') || null,
      pronouns:        form.get('pronouns') || null,
      email:           form.get('email'),
      phone:           form.get('phone') || null,
      signup_intent:   form.getAll('signup_intent'),
      days_available:  form.getAll('days_available'),
      other_notes:     form.get('other_notes') || null,
      avatar_url:      avatarUrl || null,
    }

    try {
      const res = await fetch('/api/volunteer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error || 'Submission failed')
      }
      router.push('/profile')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '3rem 1.5rem' }}>
        <div style={{ textAlign: 'center', maxWidth: '480px' }}>
          <p style={{ fontFamily: 'var(--font-display)', fontSize: '2.5rem', color: 'var(--gold)', marginBottom: '1.25rem', textShadow: '0 0 40px rgb(var(--purple-rgb) / 0.4)' }}>
            Thank you.
          </p>
          <p style={{ fontSize: '0.95rem', lineHeight: 1.8, opacity: 0.7, marginBottom: '0.75rem' }}>
            Your volunteer signup has been received.
          </p>
          <p style={{ fontSize: '0.85rem', lineHeight: 1.8, opacity: 0.45 }}>
            We'll be in touch as the event gets closer with next steps.
          </p>
          <a href="/" style={{ display: 'inline-block', marginTop: '2rem', fontSize: '0.8rem', color: 'var(--gold)', opacity: 0.6, textDecoration: 'none', letterSpacing: '0.08em' }}>
            ← Back to camp
          </a>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', position: 'relative', zIndex: 1, overflow: 'hidden' }}>
      <HandsBackdrop />

      <div style={{ maxWidth: '640px', margin: '0 auto', padding: '3rem 1.5rem 6rem', position: 'relative', zIndex: 1 }}>

        <div style={{ marginBottom: '3rem' }}>
          <a href="/apply" style={{ fontSize: '0.8rem', letterSpacing: '0.1em', color: 'var(--gold)', textDecoration: 'none', opacity: 0.6 }}>
            ← Back
          </a>
        </div>

        <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
          <p style={{ fontSize: '0.65rem', letterSpacing: '0.3em', textTransform: 'uppercase', color: 'var(--purple)', marginBottom: '1rem', opacity: 0.85 }}>
            What If 2026
          </p>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2rem, 6vw, 3rem)', color: 'var(--gold)', lineHeight: 1.1, marginBottom: '1rem', textShadow: '0 0 40px rgb(var(--purple-rgb) / 0.4)' }}>
            Volunteer Signup
          </h1>
          <p style={{ fontSize: '0.9rem', lineHeight: 1.8, opacity: 0.55, maxWidth: '440px', margin: '0 auto' }}>
            Want to be part of Glåüm without a full membership? Fill out the form below and we'll be in touch.
          </p>
        </div>

        <div style={dividerStyle} />

        <form onSubmit={handleSubmit}>

          <div className="mobile-stack" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
            <Field label={fl.label('first_name')}>
              <TextInput name="first_name" placeholder="First name" required={fl.required('first_name')} defaultValue={userFirstName} />
            </Field>
            <Field label={fl.label('last_name')}>
              <TextInput name="last_name" placeholder="Last name" required={fl.required('last_name')} defaultValue={userLastName} />
            </Field>
          </div>

          {(fl.visible('preferred_name') || fl.visible('pronouns')) && (
            <div className="mobile-stack" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
              {fl.visible('preferred_name') && (
                <Field label={fl.label('preferred_name')} optional={!fl.required('preferred_name')}>
                  <TextInput name="preferred_name" placeholder="If different from first name" required={fl.required('preferred_name')} />
                </Field>
              )}
              {fl.visible('pronouns') && (
                <Field label={fl.label('pronouns')} optional={!fl.required('pronouns')}>
                  <TextInput name="pronouns" placeholder="e.g. she/her, they/them" required={fl.required('pronouns')} />
                </Field>
              )}
            </div>
          )}

          <div className="mobile-stack" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
            <Field label={fl.label('email')}>
              <TextInput name="email" type="email" defaultValue={userEmail} readOnly required={fl.required('email')} />
            </Field>
            {fl.visible('phone') && (
              <Field label={fl.label('phone')} optional={!fl.required('phone')}>
                <TextInput name="phone" type="tel" placeholder="For shift coordination" required={fl.required('phone')} />
              </Field>
            )}
          </div>

          {fl.visible('avatar_url') && (
            <Field label={fl.label('avatar_url')}>
              {fl.desc('avatar_url') && (
                <p style={{ fontSize: '0.8rem', lineHeight: 1.7, opacity: 0.45, fontStyle: 'italic', marginBottom: '1rem' }}>
                  {fl.desc('avatar_url')}
                </p>
              )}
              <input ref={avatarInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarChange} />
              <div
                onClick={() => !avatarUploading && avatarInputRef.current?.click()}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  gap: '0.75rem', minHeight: '120px', padding: '1.5rem',
                  border: `1px dashed ${avatarPreview ? 'rgb(var(--purple-rgb) / 0.4)' : 'rgb(var(--gold-rgb) / 0.25)'}`,
                  borderRadius: '0.75rem', cursor: avatarUploading ? 'wait' : 'pointer',
                  background: avatarPreview ? 'rgb(var(--purple-rgb) / 0.04)' : 'rgba(255,255,255,0.02)',
                  transition: 'border-color 0.2s, background 0.2s',
                }}
                onMouseEnter={e => { if (!avatarUploading) (e.currentTarget as HTMLDivElement).style.borderColor = 'rgb(var(--purple-rgb) / 0.5)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = avatarPreview ? 'rgb(var(--purple-rgb) / 0.4)' : 'rgb(var(--gold-rgb) / 0.25)' }}
              >
                {avatarPreview ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', width: '100%' }}>
                    <img src={avatarPreview} alt="Preview" style={{ width: '72px', height: '72px', borderRadius: '50%', objectFit: 'cover', border: '2px solid rgb(var(--purple-rgb) / 0.3)', flexShrink: 0 }} />
                    <div>
                      {avatarUploading
                        ? <p style={{ fontSize: '0.85rem', color: 'var(--purple)', opacity: 0.8 }}>Uploading…</p>
                        : <><p style={{ fontSize: '0.85rem', color: 'var(--success)', marginBottom: '0.25rem' }}>✓ Photo uploaded</p><p style={{ fontSize: '0.75rem', opacity: 0.45, fontStyle: 'italic' }}>Click to change</p></>
                      }
                    </div>
                  </div>
                ) : (
                  <>
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="rgb(var(--gold-rgb) / 0.5)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                      <circle cx="12" cy="13" r="4" />
                    </svg>
                    <p style={{ fontSize: '0.85rem', opacity: 0.5, margin: 0 }}>Click to upload a photo</p>
                    <p style={{ fontSize: '0.72rem', opacity: 0.3, margin: 0 }}>JPEG, PNG, WebP · max 5 MB</p>
                  </>
                )}
              </div>
            </Field>
          )}

          <div style={dividerStyle} />

          {fl.visible('signup_intent') && (
            <Field label={fl.label('signup_intent')}>
              <p style={{ fontSize: '0.8rem', opacity: 0.45, fontStyle: 'italic', marginBottom: '0.85rem', lineHeight: 1.5 }}>Select all that apply</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                {SIGNUP_INTENT_OPTIONS.map(opt => (
                  <label key={opt.value} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.85rem', cursor: 'pointer', padding: '0.85rem 1rem', borderRadius: '0.6rem', border: '1px solid rgb(var(--gold-rgb) / 0.15)', background: 'rgba(255,255,255,0.02)' }}>
                    <input
                      type="checkbox"
                      name="signup_intent"
                      value={opt.value}
                      onChange={opt.value === 'other' ? e => setOtherChecked(e.target.checked) : undefined}
                      style={{ marginTop: '0.25rem', flexShrink: 0, accentColor: 'var(--purple)', cursor: 'pointer' }}
                    />
                    <div>
                      <p style={{ fontSize: '0.9rem', color: 'var(--cream)', margin: '0 0 0.2rem' }}>{opt.label}</p>
                      <p style={{ fontSize: '0.78rem', opacity: 0.45, lineHeight: 1.5, margin: 0 }}>{opt.desc}</p>
                    </div>
                  </label>
                ))}
              </div>
              {otherChecked && (
                <div style={{ marginTop: '0.75rem' }}>
                  <TextArea name="specific_interests" placeholder="Tell us more about what you have in mind…" rows={3} />
                </div>
              )}
            </Field>
          )}

          {fl.visible('days_available') && (
            <Field label={fl.label('days_available')} optional={!fl.required('days_available')}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {DAYS.map(day => (
                  <label key={day} style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', cursor: 'pointer', fontSize: '0.9rem', color: 'var(--cream)', opacity: 0.85 }}>
                    <input type="checkbox" name="days_available" value={day} style={{ width: '1rem', height: '1rem', flexShrink: 0, accentColor: 'var(--purple)', cursor: 'pointer' }} />
                    {day}
                  </label>
                ))}
              </div>
            </Field>
          )}

          {fl.visible('other_notes') && (
            <Field label={fl.label('other_notes')} optional={!fl.required('other_notes')}>
              <TextArea name="other_notes" placeholder="Skills, availability notes, questions — whatever feels relevant." rows={3} />
            </Field>
          )}

          {error && (
            <p style={{ color: '#ff6b6b', fontSize: '0.9rem', marginBottom: '1.25rem', textAlign: 'center' }}>{error}</p>
          )}

          <div style={{ textAlign: 'center', paddingTop: '0.5rem' }}>
            <button
              type="submit"
              disabled={submitting}
              style={{
                padding: '0.9rem 2.75rem',
                borderRadius: '9999px',
                border: '1px solid rgb(var(--gold-rgb) / 0.5)',
                backgroundColor: 'transparent',
                color: 'var(--lemon)',
                fontFamily: 'var(--font-display)',
                fontSize: '0.9rem',
                letterSpacing: '0.15em',
                cursor: submitting ? 'not-allowed' : 'pointer',
                opacity: submitting ? 0.5 : 1,
                transition: 'all 0.25s',
              }}
              onMouseEnter={e => { if (!submitting) e.currentTarget.style.backgroundColor = 'rgb(var(--gold-rgb) / 0.08)' }}
              onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
            >
              {submitting ? 'Submitting…' : 'Submit'}
            </button>
          </div>

        </form>
      </div>
    </div>
  )
}
