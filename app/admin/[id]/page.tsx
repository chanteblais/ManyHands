import { auth } from '@clerk/nextjs/server'
import { redirect, notFound } from 'next/navigation'
import { tenantDb } from '@/lib/tenant-db'
import { getCommunity } from '@/lib/community'
import { supabaseResizedUrl } from '@/lib/supabase-image'
import { requireAdmin } from '@/lib/admin-auth'
import { AdminActions } from '../AdminActions'
import { RemoveMemberButton } from '../RemoveMemberButton'
import { SuspendMemberButton } from '../SuspendMemberButton'
import { DuesMemberControl } from '../DuesMemberControl'
import { MemberSignupCard } from '../MemberSignupCard'
import { mergeMemberConfig } from '@/lib/form-config'
import { resolveMember, getMemberProfileValues } from '@/lib/members'
import { parseProfileFields, storedFields } from '@/lib/profile-fields'
import { getMemberAwards } from '@/lib/distinction-awards'
import { applicationFilePath, applicationFileHref, applicationFileName } from '@/lib/application-files'
import { getMemberGroups } from '@/lib/groups'
import { getAdminRunway } from '@/lib/admin-attention'
import { parseDistinctions } from '@/lib/distinctions'
import { parseDuesConfig, duesAppliesToMembers } from '@/lib/dues'
import { DistinctionAwards } from './DistinctionAwards'
import { AdminNav } from '../AdminNav'

export default async function ApplicationDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  if (!(await requireAdmin())) redirect('/')
  const community = await getCommunity()
  const db = tenantDb(community.id)

  const { data: app } = await db
    .from('applications')
    .select('*')
    .eq('id', params.id)
    .single()

  if (!app) notFound()

  // Everything here depends only on `app`, so it runs as one parallel batch.
  // Signup + held shifts exist only for members with a clerk_user_id; the three
  // page_content configs collapse into a single keyed read.
  const none = { data: null }
  const [
    { data: signup },
    { data: heldRows },
    memberGroupChips,
    runway,
    { data: cfgRows },
    member,
  ] = await Promise.all([
    app.clerk_user_id
      ? db
          .from('camp_signups')
          .select('role_id, role_approval_status')
          .eq('clerk_user_id', app.clerk_user_id)
          .maybeSingle()
      : none,
    app.clerk_user_id
      ? db
          .from('member_shift_signups')
          .select('role, schedule_events(id, title, time, day)')
          .eq('clerk_user_id', app.clerk_user_id)
      : { data: null as any[] | null },
    // Cross-reference chips (docs/admin-ux-handoff.md A5): the member's linked
    // entities at a glance, each deep-linking to where that entity is managed.
    app.clerk_user_id ? getMemberGroups(community.id, app.clerk_user_id) : [],
    getAdminRunway(community.id),
    db
      .from('page_content')
      .select('key, value')
      .in('key', ['config_member_form', 'config_distinctions', 'config_profile_fields', 'config_dues']),
    // The person's canonical member record (manual distinctions + profile values).
    (app.clerk_user_id || app.email) ? resolveMember(community.id, app.clerk_user_id ?? null, app.email) : null,
  ])
  const cfgMap: Record<string, string | undefined> = Object.fromEntries((cfgRows ?? []).map(r => [r.key, r.value]))

  // Every shift the member holds (member_shift_signups), deduped by event id.
  const shiftMap = new Map<string, { id: string; title: string; time: string | null; day: string; lead: boolean }>()
  for (const r of heldRows ?? []) {
    const ev = r.schedule_events as any
    if (ev?.id) shiftMap.set(ev.id, { id: ev.id, title: ev.title, time: ev.time ?? null, day: ev.day, lead: (r as any).role === 'lead' })
  }

  // Second batch: rows that hang off the signup / member rows above.
  const [roleRes, memberAwards, memberProfileValues] = await Promise.all([
    signup?.role_id
      ? db.from('roles').select('name, commitment, department_id, departments(name, icon)').eq('id', signup.role_id).single()
      : none,
    member ? getMemberAwards(community.id, member.id) : [],
    member ? getMemberProfileValues(community.id, member.id) : ({} as Record<string, unknown>),
  ])

  let signupData: { role: any; shifts: { id: string; title: string; time: string | null; day: string; lead: boolean }[] } | null = null
  if (signup || (heldRows ?? []).length > 0) {
    const roleRow = roleRes.data as any
    const dept = roleRow?.departments as { name: string; icon: string | null } | null

    signupData = {
      role: roleRow ? {
        name: roleRow.name,
        department: dept?.name ?? null,
        department_icon: dept?.icon ?? null,
        commitment: roleRow.commitment ?? null,
        approval_status: signup?.role_approval_status ?? null,
      } : null,
      shifts: Array.from(shiftMap.values()),
    }
  }

  const submitted = new Date(app.submitted_at).toLocaleDateString('en-CA', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })

  const isSuspended = !!member?.suspended_at

  // Render the application strictly from the member-form config so the review
  // mirrors the live form: sections + fields in config order, honouring admin
  // renames, hidden/deleted fields, width, and admin-added custom fields.
  // Built-in fields read from their column; custom fields from `custom_answers`.
  // Legacy columns no longer part of the form simply don't appear.
  const customAnswers: Record<string, string | string[]> = app.custom_answers ?? {}
  let rawCfg: object = {}
  try { if (cfgMap['config_member_form']) rawCfg = JSON.parse(cfgMap['config_member_form']!) } catch { /* defaults */ }
  const cfg = mergeMemberConfig(rawCfg)

  // Manual distinctions: the member's current hand-granted awards, plus every
  // defined distinction to offer.
  const awardRules = parseDistinctions(cfgMap['config_distinctions']).map(r => ({
    id: r.id, label: r.label, glyph: r.glyph, image: r.image, manualOnly: r.conditions.length === 0,
  }))

  // Profile Details — the member's canonical profile-field values
  // (member_profiles.values), rendered from the Profile Field registry. This is
  // the ADMIN-only surface for fields marked not visible (public=false), which
  // never appear on the member-facing profile.
  const profileFieldDefs = storedFields(parseProfileFields(cfgMap['config_profile_fields']))
  const profileDetailFields: RenderField[] = profileFieldDefs
    .map(f => {
      const raw = memberProfileValues[f.key]
      const value: string | string[] = Array.isArray(raw)
        ? raw.map(String)
        : f.type === 'boolean'
          ? (raw === true ? 'Yes' : raw === false ? 'No' : '')
          : (raw == null ? '' : String(raw))
      return {
        key: f.key,
        // Flag admin-only fields so reviewers know they're not shown publicly.
        label: f.public ? f.label : `${f.label} · admin-only`,
        value,
        long: f.type === 'textarea',
        isFile: false,
        isAgreement: false,
      }
    })
    .filter(f => (Array.isArray(f.value) ? f.value.length > 0 : String(f.value).trim() !== ''))

  // The only built-in field key whose column name differs from the key.
  const COLUMN_FOR: Record<string, string> = { dept_interests: 'department_interests' }
  // Built-in fields that should render as long-form (multi-line) answers.
  const LONG_KEYS = new Set(['about_you', 'special_skills', 'find_at_camp', 'setup_notes', 'shrimp_relationship'])

  const hasValue = (v: unknown) => Array.isArray(v) ? v.length > 0 : !!String(v ?? '').trim()

  // Profile-backed answers (fields wired to the Profile Field registry via
  // profileFieldKey) render once, in Profile Details — the canonical, current
  // value. Repeating the submitted application copy above it showed the same
  // text twice, and the two could silently disagree once the member edits their
  // profile. If the member has no canonical value yet (e.g. a pending
  // applicant), the application answer still shows.
  const canonicalKeys = new Set(profileDetailFields.map(f => f.key))

  const sections: { title: string; fields: RenderField[] }[] = []
  const seen = new Set<string>()

  for (const step of cfg.steps) {
    if (!step.visible) continue
    const rendered: RenderField[] = []
    for (const f of step.fields) {
      if (!f.visible || f.element) continue        // skip hidden + layout-only entries
      if (f.type === 'group_select') continue      // group opt-in isn't stored as an answer
      if (f.key === 'avatar_url') continue         // already shown in the header
      if (f.profileFieldKey && canonicalKeys.has(f.profileFieldKey)) {
        // Lives in Profile Details; mark as handled so the orphan sweep below
        // doesn't resurface the stored answer under "Additional Responses".
        // Exception: an "Other: …" specification exists only on the application
        // snapshot (profile values carry just the selected option), so when one
        // was submitted the application answer still renders — suppressing it
        // here would hide that text everywhere.
        const otherText = customAnswers[f.key + '__other']
        if (!(typeof otherText === 'string' && otherText.trim())) {
          seen.add(f.key); seen.add(f.key + '__other')
          continue
        }
      }

      let value: string | string[]
      let other: string | undefined
      if (f.isCustom) {
        value = customAnswers[f.key]
        const o = customAnswers[f.key + '__other']
        other = typeof o === 'string' && o.trim() ? o : undefined
        seen.add(f.key); seen.add(f.key + '__other')
      } else {
        value = (app as Record<string, any>)[COLUMN_FOR[f.key] ?? f.key]
        if (f.key === 'onboarding_status') {
          const o = app.onboarding_status_other
          other = typeof o === 'string' && o.trim() ? o : undefined
        }
      }
      if (!hasValue(value) && !other) continue

      const isFile = f.type === 'file' ||
        (typeof value === 'string' && applicationFilePath(value) !== null)
      rendered.push({
        key: f.key, label: f.label, value: value ?? '',
        long: f.type === 'textarea' || LONG_KEYS.has(f.key),
        isFile, isAgreement: f.type === 'agreement', other,
      })
    }
    if (rendered.length > 0) sections.push({ title: step.title, fields: rendered })
  }

  // Orphaned custom answers from since-deleted fields — surface them last so no
  // submitted response is silently dropped.
  const orphans: RenderField[] = []
  for (const [k, v] of Object.entries(customAnswers)) {
    if (seen.has(k) || k.endsWith('__other') || !hasValue(v)) continue
    const orphanIsFile = typeof v === 'string' && applicationFilePath(v) !== null
    orphans.push({ key: k, label: k, value: v, long: typeof v === 'string', isFile: orphanIsFile, isAgreement: false })
  }
  if (orphans.length > 0) sections.push({ title: 'Additional Responses', fields: orphans })

  return (
    <div style={{ minHeight: '100vh', position: 'relative', zIndex: 1 }}>
      <style dangerouslySetInnerHTML={{ __html: `
        @media (max-width: 560px) { .app-detail-grid { grid-template-columns: 1fr !important; } }
      ` }} />
      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '0 1.5rem 6rem' }}>

        <AdminNav runway={runway} />

        {/* Contextual back link */}
        <div style={{ marginBottom: '2.5rem' }}>
          <a href="/admin#people" style={{ fontSize: '0.8rem', letterSpacing: '0.1em', color: 'var(--gold)', textDecoration: 'none', opacity: 0.6 }}>
            ← Back to registry
          </a>
        </div>

        {/* Header */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', marginBottom: '2.5rem' }}>
          {/* Avatar */}
          {app.avatar_url ? (
            <img
              src={supabaseResizedUrl(app.avatar_url, 520) ?? app.avatar_url}
              alt={`${app.preferred_name || app.first_name} ${app.last_name}`}
              fetchPriority="high"
              style={{ width: '260px', height: '260px', borderRadius: '50%', objectFit: 'cover', border: '3px solid var(--bronze)', boxShadow: '0 0 0 1px rgb(var(--gold-rgb) / 0.2), 0 4px 24px rgba(0,0,0,0.5)', marginBottom: '1.5rem' }}
            />
          ) : (
            <div style={{ width: '260px', height: '260px', borderRadius: '50%', border: '2px solid rgb(var(--gold-rgb) / 0.15)', background: 'rgba(255,255,255,0.03)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem', color: 'rgb(var(--gold-rgb) / 0.2)', fontSize: '4rem' }}>
              ✦
            </div>
          )}

          {/* Kicker */}
          <p style={{ fontSize: '0.65rem', letterSpacing: '0.3em', textTransform: 'uppercase', color: 'var(--purple)', marginBottom: '0.3rem', opacity: 0.85 }}>
            Application
          </p>

          {/* Name */}
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2rem, 6vw, 3rem)', color: 'var(--gold)', marginBottom: '0.15rem', textShadow: '0 0 40px rgb(var(--purple-rgb) / 0.4)' }}>
            {app.preferred_name || app.first_name} {app.last_name}
          </h1>

          {app.pronouns && (
            <p style={{ fontSize: '0.85rem', opacity: 0.5, marginBottom: '0.1rem' }}>{app.pronouns}</p>
          )}
          <p style={{ fontSize: '0.8rem', opacity: 0.4, marginBottom: '0.5rem' }}>{app.email}</p>

          {/* Status pill */}
          <span style={{
            display: 'inline-block', padding: '0.3rem 1.1rem', borderRadius: '9999px',
            fontSize: '0.7rem', letterSpacing: '0.12em', textTransform: 'uppercase',
            backgroundColor: app.status === 'approved' ? 'rgb(var(--purple-rgb) / 0.15)' : app.status === 'rejected' ? 'rgba(255,255,255,0.06)' : app.status === 'cancelled' ? 'rgba(255,100,100,0.1)' : 'rgb(var(--gold-rgb) / 0.1)',
            border: `1px solid ${app.status === 'approved' ? 'rgb(var(--purple-rgb) / 0.3)' : app.status === 'rejected' ? 'rgba(255,255,255,0.15)' : app.status === 'cancelled' ? 'rgba(255,100,100,0.25)' : 'rgb(var(--gold-rgb) / 0.3)'}`,
            color: app.status === 'approved' ? 'var(--purple)' : app.status === 'rejected' ? 'rgb(var(--cream-rgb) / 0.45)' : app.status === 'cancelled' ? 'var(--danger-soft)' : 'var(--gold)',
          }}>
            {app.status === 'pending' ? '○ Pending Review' : app.status === 'approved' ? '✦ Approved' : app.status === 'rejected' ? 'Rejected' : 'Cancelled'}
          </span>

          {isSuspended && (
            <span style={{
              display: 'inline-block', marginLeft: '0.5rem', padding: '0.3rem 1.1rem', borderRadius: '9999px',
              fontSize: '0.7rem', letterSpacing: '0.12em', textTransform: 'uppercase',
              backgroundColor: 'rgba(255,180,80,0.12)', border: '1px solid rgba(255,180,80,0.35)', color: 'var(--warning)',
            }}>
              ❙❙ Suspended
            </span>
          )}

          <p style={{ fontSize: '0.72rem', opacity: 0.3, marginTop: '0.75rem', fontStyle: 'italic' }}>Submitted {submitted}</p>

          {/* Cross-reference chips — the member's linked entities (A5) */}
          {(signupData?.role || memberGroupChips.length > 0 || (signupData?.shifts.length ?? 0) > 0) && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', justifyContent: 'center', marginTop: '1rem', maxWidth: '640px' }}>
              {signupData?.role && (
                <a href="/admin/configure#structure" style={chipStyle('purple')}>
                  {signupData.role.department ? `${signupData.role.department} · ` : ''}{signupData.role.name}
                </a>
              )}
              {memberGroupChips.map(g => (
                <a key={g.id} href="/admin/configure#structure" style={chipStyle('gold')}>
                  {g.icon && !g.icon_image ? `${g.icon} ` : ''}{g.name}
                </a>
              ))}
              {(signupData?.shifts.length ?? 0) > 0 && (
                <a href="#role-shift" style={chipStyle('gold')}>
                  {signupData!.shifts.length} shift{signupData!.shifts.length === 1 ? '' : 's'} held
                </a>
              )}
            </div>
          )}
        </div>

        {/* Actions for pending */}
        {app.status === 'pending' && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', marginBottom: '3rem' }}>
            <AdminActions id={app.id} email={app.email} redirectAfter="/admin" />
          </div>
        )}

        {app.status === 'cancelled' && app.cancel_reason && (
          <div style={{ marginBottom: '2.5rem', padding: '1.25rem 1.5rem', border: '1px solid rgba(255,120,120,0.25)', borderRadius: '0.75rem', background: 'rgba(255,0,0,0.04)' }}>
            <p style={{ fontSize: '0.7rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--danger-soft)', marginBottom: '0.5rem' }}>
              Cancellation reason
            </p>
            <p style={{ fontSize: '0.9rem', lineHeight: 1.7, opacity: 0.75, fontStyle: 'italic' }}>{app.cancel_reason}</p>
            {app.cancelled_at && (
              <p style={{ fontSize: '0.75rem', opacity: 0.4, marginTop: '0.5rem' }}>
                Cancelled {new Date(app.cancelled_at).toLocaleString('en-CA')}
              </p>
            )}
          </div>
        )}

        <div style={{ height: '1px', background: 'linear-gradient(90deg, transparent, rgb(var(--gold-rgb) / 0.2), transparent)', marginBottom: '2.5rem' }} />

        {/* Role & Shift */}
        {app.clerk_user_id && (
          <div id="role-shift">
            <Section title="Role & Shift">
              <MemberSignupCard
                clerkUserId={app.clerk_user_id}
                role={signupData?.role ?? null}
                shifts={signupData?.shifts ?? []}
              />
            </Section>
            <Divider />
          </div>
        )}

        {/* Sections — driven entirely by the live member-form config */}
        {sections.map((section, i) => (
          <div key={section.title + i}>
            {i > 0 && <Divider />}
            <Section title={section.title}>
              <FieldList fields={section.fields} />
            </Section>
          </div>
        ))}

        {/* Profile Details — canonical profile-field values, incl. admin-only ones */}
        {profileDetailFields.length > 0 && (
          <>
            <Divider />
            <Section title="Profile Details">
              <FieldList fields={profileDetailFields} />
            </Section>
          </>
        )}

        {/* Actions at bottom too */}
        {app.status === 'pending' && (
          <>
            <Divider />
            <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem' }}>
              <AdminActions id={app.id} email={app.email} redirectAfter="/admin" />
            </div>
          </>
        )}

        {/* Manual distinctions — grant/revoke honours by hand */}
        {app.status === 'approved' && (
          <>
            <Divider />
            <Section title="Distinctions">
              <DistinctionAwards memberId={member?.id ?? null} rules={awardRules} initialAwards={memberAwards} />
            </Section>
          </>
        )}

        {/* Camp dues — mark paid / unpaid (also settable in Community → Camp Dues).
            id="dues" is the target of the "Confirm payment" notification link.
            Hidden when dues are off or not applied to members. */}
        {app.status === 'approved' && member?.id && duesAppliesToMembers(parseDuesConfig(cfgMap['config_dues'])) && (
          <div id="dues" style={{ scrollMarginTop: '5.5rem' }}>
            <Divider />
            <Section title="Camp Dues">
              <DuesMemberControl
                memberId={member.id}
                name={`${app.preferred_name || app.first_name} ${app.last_name}`}
                paidAt={member.dues_paid_at}
                reportedAt={member.dues_reported_at}
                note={member.dues_note}
              />
            </Section>
          </div>
        )}

        {/* Suspend or remove an approved member */}
        {app.status === 'approved' && (
          <>
            <Divider />
            {isSuspended && member?.suspension_note && (
              <div style={{ maxWidth: '480px', margin: '0 auto 1.25rem', padding: '1rem 1.25rem', border: '1px solid rgba(255,180,80,0.3)', borderRadius: '0.75rem', background: 'rgba(255,180,80,0.05)' }}>
                <p style={{ fontSize: '0.7rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--warning)', marginBottom: '0.5rem' }}>
                  Suspension note
                </p>
                <p style={{ fontSize: '0.9rem', lineHeight: 1.7, opacity: 0.75, fontStyle: 'italic' }}>{member.suspension_note}</p>
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
              <SuspendMemberButton
                id={app.id}
                name={`${app.preferred_name || app.first_name} ${app.last_name}`}
                suspended={isSuspended}
              />
              <RemoveMemberButton
                id={app.id}
                name={`${app.preferred_name || app.first_name} ${app.last_name}`}
                redirectAfter="/admin"
              />
            </div>
          </>
        )}

      </div>
    </div>
  )
}

// File answers store an /api/apply/file href (or, pre-072, a public storage
// URL) — the shared helpers understand both forms.
const fileNameFromUrl = (url: string) => applicationFileName(url, 'Attachment')

type RenderField = {
  key: string; label: string; value: string | string[]
  long: boolean; isFile: boolean; isAgreement: boolean; other?: string
}

// Lay out a section's answers in config order: consecutive short fields pair
// into a two-column grid; long/array/file/agreement answers render full width.
function FieldList({ fields }: { fields: RenderField[] }) {
  const out: React.ReactNode[] = []
  let bucket: RenderField[] = []
  const flush = () => {
    if (bucket.length === 0) return
    out.push(
      <Grid key={`grid-${out.length}`}>
        {bucket.map(f => <Field key={f.key} label={f.label} value={f.value as string} />)}
      </Grid>
    )
    bucket = []
  }
  for (const f of fields) {
    const isShort = !f.long && !f.isFile && !f.isAgreement && !Array.isArray(f.value)
    if (isShort) { bucket.push(f); continue }
    flush()
    out.push(<FullAnswer key={f.key} f={f} />)
  }
  flush()
  return <>{out}</>
}

function FullAnswer({ f }: { f: RenderField }) {
  const { label, value, isFile, isAgreement, other } = f
  return (
    <div style={{ padding: '1rem 1.25rem', border: '1px solid rgb(var(--gold-rgb) / 0.1)', borderRadius: '0.5rem', background: 'rgba(255,255,255,0.02)', marginBottom: '1rem' }}>
      {label && <p style={{ fontSize: '0.65rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--gold)', opacity: 0.55, marginBottom: '0.5rem' }}>{label}</p>}
      {isFile && typeof value === 'string' ? (
        <a href={applicationFileHref(value)} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', color: 'var(--gold)', fontSize: '0.9rem', textDecoration: 'none' }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
          </svg>
          <span style={{ textDecoration: 'underline', textUnderlineOffset: '2px' }}>{fileNameFromUrl(value)}</span>
        </a>
      ) : isAgreement && Array.isArray(value) ? (
        <ul style={{ paddingLeft: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.4rem', margin: 0 }}>
          {value.map(v => <li key={v} style={{ fontSize: '0.875rem', opacity: 0.65, lineHeight: 1.5 }}>{v}</li>)}
        </ul>
      ) : Array.isArray(value) ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
          {value.map(v => (
            <span key={v} style={{ padding: '0.25rem 0.75rem', borderRadius: '9999px', border: '1px solid rgb(var(--gold-rgb) / 0.2)', fontSize: '0.8rem', opacity: 0.8 }}>{v}</span>
          ))}
        </div>
      ) : (
        <p style={{ fontSize: '0.9rem', opacity: 0.8, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{value}</p>
      )}
      {other && (
        <p style={{ fontSize: '0.85rem', opacity: 0.7, marginTop: '0.5rem' }}>
          <span style={{ color: 'var(--gold)', opacity: 0.7 }}>Other:</span> {other}
        </p>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '0.5rem' }}>
      <p style={{ fontSize: '0.7rem', letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--purple)', marginBottom: '1.25rem', opacity: 0.7 }}>
        {title}
      </p>
      {children}
    </div>
  )
}

function Grid({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-detail-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '0.5rem' }}>
      {children}
    </div>
  )
}

function Field({ label, value }: { label: string; value: string | null }) {
  if (!value) return null
  return (
    <div style={{ padding: '0.75rem 1rem', border: '1px solid rgb(var(--gold-rgb) / 0.1)', borderRadius: '0.5rem', background: 'rgba(255,255,255,0.02)' }}>
      <p style={{ fontSize: '0.65rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--gold)', opacity: 0.55, marginBottom: '0.3rem' }}>{label}</p>
      <p style={{ fontSize: '0.9rem', opacity: 0.85 }}>{value}</p>
    </div>
  )
}

function Divider() {
  return <div style={{ height: '1px', background: 'linear-gradient(90deg, transparent, rgb(var(--gold-rgb) / 0.15), transparent)', margin: '2.5rem 0' }} />
}

// Cross-reference chip (A5): a small linked capsule for one related entity.
function chipStyle(accent: 'gold' | 'purple'): React.CSSProperties {
  const gold = accent === 'gold'
  return {
    display: 'inline-block',
    padding: '0.3rem 0.85rem',
    borderRadius: '9999px',
    fontSize: '0.72rem',
    letterSpacing: '0.05em',
    textDecoration: 'none',
    whiteSpace: 'nowrap',
    border: `1px solid ${gold ? 'rgb(var(--gold-rgb) / 0.3)' : 'rgb(var(--purple-rgb) / 0.35)'}`,
    color: gold ? 'var(--gold)' : 'var(--purple)',
    background: gold ? 'rgb(var(--gold-rgb) / 0.06)' : 'rgb(var(--purple-rgb) / 0.07)',
  }
}
