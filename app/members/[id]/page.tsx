import { HandsBackdrop } from '@/components/HandsBackdrop'
import { auth } from '@clerk/nextjs/server'
import { EventIcon } from '@/components/EventIcon'
import { IconImage, ROUND_FILL } from '@/components/IconImage'
import { redirect, notFound } from 'next/navigation'
import { tenantDb } from '@/lib/tenant-db'
import { getCommunity } from '@/lib/community'
import { getPageContent } from '@/lib/page-content'
import { displayPlacement } from '@/lib/late-night'
import { Header } from '@/components/Header'
import { supabaseResizedUrl } from '@/lib/supabase-image'
import { getMemberGroups, type MemberGroup } from '@/lib/groups'
import { buildMemberFacts } from '@/lib/member-facts'
import { parseDistinctions, evaluateDistinctions } from '@/lib/distinctions'
import { resolveMember, getMemberProfileValues, getApprovedMember } from '@/lib/members'
import { parseProfileFields, storedFields } from '@/lib/profile-fields'
import { getMemberAwards } from '@/lib/distinction-awards'
import { CabinetOfDistinctions } from '@/app/profile/CabinetOfDistinctions'
import { ApprovedCamperPill } from '@/app/ApprovedCamperPill'

const GOLD = '#C8A848'
const PURPLE = '#D239F8'
const CREAM = '#F3EDE6'
// Warm, well-lit cream for value text (names, group titles, bio) — matches the
// golden-lit tone of the profile mock more closely than the cooler CREAM.
const WARM = '#D9CBA8'
// About-narrative tone — the warm dusty rose-tan used for commitment
// descriptions on the member's own /profile (CommitmentsSection Row), kept in
// sync so the "About" reads the same across both profiles.
const ROSE = '#B0947A'

// A patch-style value is an uploaded image (URL); anything else is an emoji glyph.
const isImageIcon = (v: string) => /^https?:\/\//.test(v) || v.startsWith('/')

// Card shell shared by every section — the warm, gold-edged registry panel.
function cardStyle(): React.CSSProperties {
  return {
    border: '1px solid rgba(200,168,72,0.28)',
    borderRadius: '1rem',
    background: 'rgba(10,0,20,0.55)',
    boxShadow: '0 0 0 1px rgba(200,168,72,0.06), 0 18px 50px rgba(0,0,0,0.35)',
    padding: '0.9rem 1.05rem 1.05rem',
  }
}

// Ceremonial section heading: ✦ — TITLE — ✦, echoing the Cabinet's header.
function SectionHeading({ title }: { title: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.85rem', marginBottom: '1.4rem' }}>
      <span aria-hidden style={{ color: GOLD, fontSize: '0.7rem', opacity: 0.85 }}>✦</span>
      <span aria-hidden style={{ width: '34px', height: '1px', background: 'linear-gradient(90deg, transparent, rgba(200,168,72,0.55))' }} />
      <h2 style={{
        fontFamily: 'var(--font-cormorant-garamond), serif', fontSize: '1.05rem', fontWeight: 600,
        letterSpacing: '0.22em', textTransform: 'uppercase', color: GOLD, margin: 0,
        textShadow: '0 0 18px rgba(200,168,72,0.3)', whiteSpace: 'nowrap',
      }}>{title}</h2>
      <span aria-hidden style={{ width: '34px', height: '1px', background: 'linear-gradient(90deg, rgba(200,168,72,0.55), transparent)' }} />
      <span aria-hidden style={{ color: GOLD, fontSize: '0.7rem', opacity: 0.85 }}>✦</span>
    </div>
  )
}

export default async function MemberPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')
  const community = await getCommunity()
  const db = tenantDb(community.id)

  // Viewer gate + target member fetch are independent — one parallel batch.
  // getApprovedMember is the standard clerk_user_id-first lookup (email
  // fallback only on a miss), so no Clerk Backend-API call on the hot path.
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(params.id)
  const [viewer, { data: member }] = await Promise.all([
    getApprovedMember(community.id, userId),
    db
      .from('applications')
      .select('id, first_name, preferred_name, pronouns, avatar_url, clerk_user_id, submitted_at, status, camped_before')
      .eq('status', 'approved')
      .eq(isUuid ? 'id' : 'clerk_user_id', params.id)
      .maybeSingle(),
  ])

  // Only approved members can view other profiles
  if (!viewer) redirect('/profile')

  // Not a member id — it may be a volunteer (directory cards link here too).
  if (!member) {
    const { data: volunteer } = isUuid
      ? await db
          .from('volunteers')
          .select('id, first_name, preferred_name, pronouns, avatar_url, created_at, clerk_user_id')
          .eq('status', 'active')
          .eq('id', params.id)
          .maybeSingle()
      : { data: null }
    if (!volunteer) notFound()
    // Volunteers hold shifts too (that's the point of volunteering) — the same
    // registry card the member profile shows.
    const { data: volShiftRows } = volunteer.clerk_user_id
      ? await db
          .from('member_shift_signups')
          .select('occurrence_date, role, schedule_events(id, title, day, time, icon_type, event_date)')
          .eq('clerk_user_id', volunteer.clerk_user_id)
      : { data: null }
    return <VolunteerProfile volunteer={volunteer} heldShifts={buildHeldShifts(volShiftRows)} />
  }

  // Everything below depends only on the member row: signup with role + dept,
  // group affiliations, the two page_content configs (one keyed read), and the
  // canonical member record.
  const [{ data: campSignup }, memberGroups, cfgMap, profileMember, { data: shiftRows }] = await Promise.all([
    member.clerk_user_id
      ? db
          .from('camp_signups')
          .select('role_id, role_approval_status, roles(name, description, purpose, department_id, departments(name, icon, description))')
          .eq('clerk_user_id', member.clerk_user_id)
          .maybeSingle()
      : { data: null },
    // Group affiliations — the member's "Contributions" (Setup / Decor / Teardown …).
    getMemberGroups(member.clerk_user_id as string | null),
    getPageContent(community.id, ['config_distinctions', 'config_profile_fields']),
    resolveMember(community.id, (member.clerk_user_id as string | null) ?? null),
    // Shifts the member holds — same source as their own /profile commitments
    // card (member_shift_signups), plus the night held + lead offer per row.
    member.clerk_user_id
      ? db
          .from('member_shift_signups')
          .select('occurrence_date, role, schedule_events(id, title, day, time, icon_type, event_date)')
          .eq('clerk_user_id', member.clerk_user_id)
      : { data: null },
  ])

  const heldShifts = buildHeldShifts(shiftRows)

  const roleInfo = campSignup?.roles as { name?: string; description?: string | null; purpose?: string | null; departments?: { name?: string; icon?: string; description?: string | null } | null } | null
  const roleApproved = !!campSignup?.role_id && campSignup?.role_approval_status !== 'pending'

  // Merged namespace: stored profile values ∪ derived system facts (system wins).
  // Guarded — falls back to system-facts-only when no member row exists yet.
  const [profileValues, awardedIdList] = profileMember
    ? await Promise.all([getMemberProfileValues(community.id, profileMember.id), getMemberAwards(profileMember.id)])
    : [{} as Record<string, unknown>, null]
  const awardedIds = awardedIdList ? new Set(awardedIdList) : undefined

  // Earned medals — derived from facts against the admin's distinction rules
  // (store-the-facts, derive-the-badge). Never persisted; recomputed per render.
  // profileValues feeds the facts too: joined_year derives from the member's
  // reported Gatherings-Attended years (falling back to application year).
  const memberFacts = buildMemberFacts({ application: member, roleInfo, memberGroups, roleApproved, profileValues })
  const factContext = { ...profileValues, ...memberFacts }
  const earnedDistinctions = evaluateDistinctions(factContext, parseDistinctions(cfgMap['config_distinctions']), awardedIds)

  const displayName = member.preferred_name || member.first_name || 'Member'
  const memberSince = memberFacts.joined_year
  const deptName = roleApproved ? roleInfo?.departments?.name ?? null : null
  const deptIcon = roleInfo?.departments?.icon ?? null
  const deptDesc = roleApproved ? roleInfo?.departments?.description ?? null : null
  const roleName = roleApproved ? roleInfo?.name ?? null : null
  // Short description shown under each role (mirrors the designation short desc).
  const roleDesc = roleApproved ? roleInfo?.description ?? null : null

  // Optional quote shown under the name (profile field key `quote`).
  const quoteText = typeof profileValues['quote'] === 'string' ? (profileValues['quote'] as string).trim() : ''

  // Contributions = group memberships, grouped by their collection (visible ones
  // only), each collection titled by its own name. Nothing is hardcoded —
  // collections and their order come from the data.
  const visibleGroups = memberGroups.filter(g => g.showOnProfile)
  const contributionCollections = groupByCollection(visibleGroups)

  // Bio + skills come from the canonical profile values (member_profiles.values),
  // the same source the member's own /profile reads — NOT the legacy
  // applications.public_bio / public_skills columns (stale since the
  // "profile = source of truth" refactor).
  const bio = typeof profileValues['bio'] === 'string' ? (profileValues['bio'] as string).trim() || null : null
  const skillsVal = profileValues['skills']
  const skills = Array.isArray(skillsVal)
    ? skillsVal.map(v => String(v).trim()).filter(Boolean)
    : typeof skillsVal === 'string'
      ? skillsVal.split(',').map(s => s.trim()).filter(Boolean)
      : []

  // Public registry-defined profile fields with a value (Phase 4). bio / quote /
  // skills are excluded — they render in their own dedicated spots (About column,
  // under-name quote, Skills & Gifts), so listing them here would double up.
  const DEDICATED_FIELD_KEYS = new Set(['bio', 'quote', 'skills'])
  const publicProfileFields = storedFields(parseProfileFields(cfgMap['config_profile_fields']))
    .filter(f => f.public && !DEDICATED_FIELD_KEYS.has(f.key))
    .map(f => ({ field: f, value: profileValues[f.key] }))
    .filter(({ value }) => value != null && value !== '' && !(Array.isArray(value) && value.length === 0))


  return (
    <div style={{ minHeight: '100vh', position: 'relative', zIndex: 1, overflow: 'hidden' }}>
      <Header />
      <style dangerouslySetInnerHTML={{ __html: `
        .pub-hero { display: grid; grid-template-columns: auto 1fr; align-items: center; gap: 2.5rem; }
        .pub-hero-id { min-width: 0; }
        .pub-msg-btn:hover { background: rgba(210,57,248,0.22) !important; border-color: rgba(210,57,248,0.78) !important; box-shadow: 0 0 14px rgba(175,75,255,0.3) !important; }
        .pub-roles { display: grid; grid-template-columns: 1fr auto 1fr; align-items: start; justify-items: center; gap: 1.4rem; }
        @media (max-width: 720px) {
          .pub-hero { grid-template-columns: 1fr; justify-items: center; text-align: center; gap: 1.4rem; margin-left: 0 !important; }
          .pub-hero-id { text-align: center; }
          .pub-about { margin-left: 0 !important; }
        }
        @media (max-width: 820px) {
          .pub-roles { grid-template-columns: 1fr; gap: 1.1rem; }
          .pub-roles > :nth-child(2) { display: none; }
        }
      ` }} />
      <HandsBackdrop />

      <main aria-labelledby="member-heading" style={{ maxWidth: '1080px', margin: '0 auto', padding: '6rem 1.5rem 7rem', position: 'relative', zIndex: 1 }}>

        {/* ── Hero: portrait (left) · identity (right) ─────────────────────── */}
        <header className="pub-hero" style={{ marginBottom: '0.85rem', marginLeft: '2rem' }}>
          <div style={{
            width: '260px', height: '260px', borderRadius: '50%',
            border: '5px solid #6F491F',
            boxShadow: '0 0 0 1px rgba(60,35,10,0.6), 0 0 20px rgba(111,73,31,0.25), 0 8px 32px rgba(0,0,0,0.55)',
            background: 'rgba(200,168,72,0.08)', overflow: 'hidden', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {member.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={supabaseResizedUrl(member.avatar_url as string, 520) ?? ''} alt={`${displayName}'s portrait`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <span aria-hidden="true" style={{ fontFamily: 'TokyoDreams, serif', fontSize: '3rem', color: GOLD, opacity: 0.5 }}>
                {displayName.charAt(0).toUpperCase()}
              </span>
            )}
          </div>

          <div className="pub-hero-id">
            <h1 id="member-heading" style={{ fontFamily: 'TokyoDreams, serif', fontSize: 'clamp(2rem, 4.5vw, 3rem)', color: GOLD, margin: '0 0 0.35rem', textShadow: '0 0 40px rgba(210,57,248,0.4)' }}>
              {displayName}
              <span aria-hidden style={{ color: GOLD, fontSize: '0.5em', opacity: 0.8, marginLeft: '0.5rem', verticalAlign: '0.25em' }}>✦</span>
            </h1>
            {member.pronouns && (
              <p style={{ fontSize: '0.9rem', color: PURPLE, opacity: 0.9, margin: '0 0 0.55rem' }}>{member.pronouns as string}</p>
            )}
            {memberSince && (
              <p style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.82rem', letterSpacing: '0.05em', color: WARM, opacity: 0.85, margin: '0 0 0.55rem' }}>
                <CalendarGlyph /> Member since {memberSince}
              </p>
            )}
            {quoteText && (
              <p style={{ fontSize: '1rem', fontStyle: 'italic', color: '#C9B68F', opacity: 0.9, lineHeight: 1.5, fontFamily: 'var(--font-cormorant-garamond), serif', maxWidth: '22rem', margin: '0.15rem 0 0' }}>
                “{quoteText}”
              </p>
            )}
            <div style={{ marginTop: '1rem', display: 'flex', flexWrap: 'wrap', gap: '0.7rem' }}>
              <ApprovedCamperPill />
              {member.clerk_user_id && <a className="pub-msg-btn" href={`/messages/${member.clerk_user_id}`} aria-label={`Send a message to ${displayName}`} style={{ display: 'inline-block', padding: '0.42rem 1.3rem', borderRadius: '9999px', background: 'rgba(210,57,248,0.13)', border: '1px solid rgba(210,57,248,0.5)', boxShadow: '0 0 10px rgba(175,75,255,0.14)', color: '#EEB4F6', fontSize: '0.72rem', letterSpacing: '0.08em', textDecoration: 'none', fontFamily: 'TokyoDreams, serif', transition: 'background 0.15s, border-color 0.15s, box-shadow 0.15s' }}>
                <span aria-hidden="true">✉ </span>Message
              </a>}
            </div>
          </div>
        </header>

        {/* ── About (plain text under the hero) · Roles · Contributions ──────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.95rem', marginBottom: '0.85rem' }}>
          {bio && (
            <section className="pub-about" style={{ alignSelf: 'flex-start', maxWidth: '26rem', width: '100%', marginLeft: '3.25rem' }}>
              <ColHeading title="About" align="left" />
              <p style={{ fontSize: '0.92rem', lineHeight: 1.85, color: ROSE, whiteSpace: 'pre-line', textAlign: 'left', margin: 0 }}>{bio}</p>
            </section>
          )}

          {(deptName || roleName) && (
            <section style={cardStyle()}>
              <ColHeading title="Roles & Responsibilities" />
              {deptName && roleName ? (
                <div className="pub-roles">
                  <DetailRow large centered icon="/handicon.png" kicker="Primary role" title={roleName} desc={roleDesc} />
                  <RoleSeparator />
                  <DetailRow large centered icon={deptIcon || '✦'} kicker="Department" title={deptName} desc={deptDesc} />
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {roleName && <DetailRow large icon="/handicon.png" kicker="Primary role" title={roleName} desc={roleDesc} />}
                  {deptName && <DetailRow large icon={deptIcon || '✦'} kicker="Department" title={deptName} desc={deptDesc} />}
                </div>
              )}
            </section>
          )}

          {contributionCollections.length > 0 && (
            <section style={cardStyle()}>
              {/* Collections sit inline, separated by a soft vertical divide;
                  when a collection can't fit it wraps onto its own row. */}
              <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'stretch', rowGap: '1.5rem' }}>
                {contributionCollections.flatMap((col, ci) => [
                  ...(ci > 0 ? [
                    <span
                      key={`cdiv-${col.id ?? ci}`}
                      aria-hidden
                      style={{ alignSelf: 'stretch', width: '1px', margin: '0 1.6rem', background: 'linear-gradient(to bottom, transparent, rgba(200,168,72,0.28) 22%, rgba(200,168,72,0.28) 78%, transparent)' }}
                    />,
                  ] : []),
                  <div key={col.id ?? '__none__'} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <ColHeading title={col.name || 'Contributions'} />
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'center', gap: '0.6rem 1.4rem' }}>
                      {col.groups.flatMap((g, i) => [
                        ...(i > 0 ? [<span key={`cs-${g.id}`} aria-hidden style={{ alignSelf: 'center', color: PURPLE, fontSize: '0.7rem', opacity: 0.8 }}>✦</span>] : []),
                        <div key={g.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', width: '92px' }}>
                          <IconMedallion icon={g.icon || g.icon_image || '✦'} size={76} />
                          <span style={{ fontSize: '0.85rem', color: WARM, fontFamily: 'var(--font-cormorant-garamond), serif', fontWeight: 600, textAlign: 'center' }}>{g.name}</span>
                        </div>,
                      ])}
                    </div>
                  </div>,
                ])}
              </div>
            </section>
          )}

          {/* ── Shifts — every shift the member holds, with the night(s) + time ── */}
          <ShiftsSection shifts={heldShifts} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>

          {/* ── Distinctions — the cabinet of honours (sits directly under the top row) ─ */}
          {earnedDistinctions.length > 0 && (
            <section>
              <CabinetOfDistinctions distinctions={earnedDistinctions} title="Distinctions" compact />
            </section>
          )}

          {/* ── Profile fields (registry-defined, public) ───────────────────── */}
          {publicProfileFields.length > 0 && (
            <section style={cardStyle()}>
              <SectionHeading title="Profile" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
                {publicProfileFields.map(({ field, value }) => (
                  <div key={field.key} style={{ textAlign: 'center' }}>
                    <p style={{ fontSize: '0.65rem', letterSpacing: '0.15em', textTransform: 'uppercase', color: GOLD, opacity: 0.6, marginBottom: '0.35rem' }}>{field.label}</p>
                    {Array.isArray(value) ? (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', justifyContent: 'center' }}>
                        {value.map((v, i) => (
                          <span key={i} style={{ padding: '0.35rem 0.85rem', borderRadius: '9999px', border: '1px solid rgba(200,168,72,0.3)', background: 'rgba(200,168,72,0.07)', color: CREAM, fontSize: '0.82rem' }}>{String(v)}</span>
                        ))}
                      </div>
                    ) : (
                      <p style={{ fontSize: '0.9rem', color: CREAM, opacity: 0.85, margin: 0 }}>{field.type === 'boolean' ? (value ? 'Yes' : 'No') : String(value)}</p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── Skills & Gifts ─────────────────────────────────────────────── */}
          {skills.length > 0 && (
            <section style={cardStyle()}>
              <SectionHeading title="Skills & Gifts" />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', justifyContent: 'center' }}>
                {skills.map((s, i) => (
                  <span key={i} style={{
                    padding: '0.45rem 1rem', borderRadius: '9999px',
                    border: '1px solid rgba(210,57,248,0.32)', background: 'rgba(210,57,248,0.07)',
                    color: '#F4E3FA', fontSize: '0.85rem', letterSpacing: '0.02em',
                  }}>{s}</span>
                ))}
              </div>
            </section>
          )}

        </div>
      </main>
    </div>
  )
}

// Group a member's visible groups by their collection, ordered by the
// collection's sort order (groups already arrive sorted within each).
function groupByCollection(groups: MemberGroup[]) {
  const map = new Map<string, { id: string | null; name: string | null; sort: number; groups: MemberGroup[] }>()
  for (const g of groups) {
    const key = g.collectionId ?? '__none__'
    if (!map.has(key)) map.set(key, { id: g.collectionId, name: g.collectionName, sort: g.collectionSort, groups: [] })
    map.get(key)!.groups.push(g)
  }
  return Array.from(map.values()).sort((a, b) => a.sort - b.sort)
}

// Gold caps column heading flanked by ✦ ornaments (✦ TITLE ✦), matching the
// registry-card headers in the mock. Used inside the tri-column card.
function ColHeading({ title, align = 'center' }: { title: string; align?: 'center' | 'left' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: align === 'left' ? 'flex-start' : 'center', gap: '0.6rem', margin: '0 0 0.9rem' }}>
      <span aria-hidden style={{ color: GOLD, fontSize: '0.72rem', opacity: 0.8 }}>✦</span>
      <h2 style={{
        fontFamily: 'var(--font-cormorant-garamond), serif', fontSize: '0.92rem', fontWeight: 600,
        letterSpacing: '0.14em', textTransform: 'uppercase', color: GOLD, textAlign: 'center',
        margin: 0, textShadow: '0 0 18px rgba(200,168,72,0.25)', whiteSpace: 'nowrap',
      }}>{title}</h2>
      <span aria-hidden style={{ color: GOLD, fontSize: '0.72rem', opacity: 0.8 }}>✦</span>
    </div>
  )
}

// The ── ✦ ── flourish shown beneath the About narrative, echoing the divider
// under the designation on the member's own profile.
function Flourish() {
  return (
    <div aria-hidden style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem', marginTop: '1.15rem' }}>
      <span style={{ width: '30px', height: '1px', background: 'linear-gradient(90deg, transparent, rgba(200,168,72,0.55))' }} />
      <span style={{ color: GOLD, fontSize: '0.6rem', opacity: 0.85 }}>✦</span>
      <span style={{ width: '30px', height: '1px', background: 'linear-gradient(90deg, rgba(200,168,72,0.55), transparent)' }} />
    </div>
  )
}

// The brass ring medallion that holds an emoji glyph or an uploaded icon image.
function IconMedallion({ icon, size = 44 }: { icon: string; size?: number }) {
  return (
    <span aria-hidden style={{
      width: size, height: size, flexShrink: 0, borderRadius: '50%', overflow: 'hidden',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'radial-gradient(circle at 42% 38%, rgba(200,168,72,0.14), rgba(8,0,18,0.85))',
      border: '1.5px solid #C07C26', fontSize: size >= 74 ? '1.85rem' : size >= 64 ? '1.55rem' : size >= 52 ? '1.3rem' : '1.1rem',
    }}>
      {isImageIcon(icon)
        ? /* eslint-disable-next-line @next/next/no-img-element */ <IconImage src={icon} size="100%" fill={ROUND_FILL} />
        : icon}
    </span>
  )
}

// Medallion variant for shift icons: `icon_type` is either an image URL (render
// like every other medallion) or a built-in glyph name that EventIcon draws as
// a gold stroke icon. Image icons go through IconImage directly — EventIcon's
// 1.5x image box would overfill the ring (see CommitmentsSection).
function ShiftMedallion({ icon, size = 76 }: { icon: string; size?: number }) {
  return (
    <span aria-hidden style={{
      width: size, height: size, flexShrink: 0, borderRadius: '50%', overflow: 'hidden',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'radial-gradient(circle at 42% 38%, rgba(200,168,72,0.14), rgba(8,0,18,0.85))',
      border: '1.5px solid #C07C26',
    }}>
      {isImageIcon(icon)
        ? /* eslint-disable-next-line @next/next/no-img-element */ <IconImage src={icon} size="100%" fill={ROUND_FILL} />
        : <span style={{ color: GOLD, opacity: 0.75, display: 'flex' }}><EventIcon type={icon} size={Math.round(size * 0.5)} /></span>}
    </span>
  )
}

// One entry per shift event, carrying every night held (a recurring shift's
// nights are independent signups — migration 064) and whether the holder has
// offered to lead any of them. Shared by the member and volunteer registers.
type PublicShift = { id: string; title: string; time: string; icon_type: string; nights: string[]; dayFallback: string; isLead: boolean; lateNight: boolean }

function buildHeldShifts(shiftRows: unknown[] | null): PublicShift[] {
  const shiftMap = new Map<string, PublicShift>()
  for (const r of (shiftRows ?? []) as { occurrence_date?: string | null; role?: string | null; schedule_events?: unknown }[]) {
    const ev = r.schedule_events as { id?: string; title?: string; day?: string; time?: string; icon_type?: string; event_date?: string | null } | null
    if (!ev?.id) continue
    const cur = shiftMap.get(ev.id) ?? {
      id: ev.id, title: ev.title ?? '', time: ev.time ?? '',
      icon_type: ev.icon_type ?? 'star', nights: [], dayFallback: ev.day ?? '', isLead: false, lateNight: false,
    }
    // Late-night convention (lib/late-night.ts): a shift starting before 6 AM
    // is listed under the previous night, matching every schedule surface.
    const trueNight = (r.occurrence_date as string | null) ?? ev.event_date ?? null
    const placed = trueNight ? displayPlacement(ev.time ?? null, trueNight) : null
    const night = placed?.displayDate ?? trueNight
    if (placed?.lateNight) cur.lateNight = true
    if (night && !cur.nights.includes(night)) cur.nights.push(night)
    if (r.role === 'lead') cur.isLead = true
    shiftMap.set(ev.id, cur)
  }
  const held = Array.from(shiftMap.values())
  held.forEach(s => s.nights.sort())
  held.sort((a, b) => (a.nights[0] ?? '9999').localeCompare(b.nights[0] ?? '9999') || a.title.localeCompare(b.title))
  return held
}

// The Shifts registry card — medallion, title, night(s) + time, lead marker.
// Renders nothing when no shifts are held.
function ShiftsSection({ shifts }: { shifts: PublicShift[] }) {
  if (shifts.length === 0) return null
  return (
    <section style={cardStyle()}>
      <ColHeading title="Shifts" />
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'center', gap: '1.3rem 1.8rem' }}>
        {shifts.map(s => (
          <div key={s.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', width: '132px', textAlign: 'center' }}>
            <ShiftMedallion icon={s.icon_type} size={76} />
            <div style={{ minWidth: 0 }}>
              <p style={{ fontSize: '0.85rem', color: WARM, fontFamily: 'var(--font-cormorant-garamond), serif', fontWeight: 600, margin: 0 }}>{s.title}</p>
              {s.isLead && (
                <p style={{ fontSize: '0.6rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: PURPLE, opacity: 0.9, margin: '0.25rem 0 0' }}>✦ Lead</p>
              )}
              <p style={{ fontSize: '0.7rem', color: ROSE, lineHeight: 1.5, margin: '0.3rem 0 0' }}>
                {shiftNightsLabel(s)}
                {s.time && <><br />{s.time}{s.lateNight ? ' · late night' : ''}</>}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

// The night(s) a shift is held. One night reads long ("Saturday, July 25" —
// matching the member's own profile card); several read short, joined by ✦
// ("Fri, Jul 24 ✦ Sat, Jul 25"); an undated shift falls back to its day label.
function shiftNightsLabel(s: { nights: string[]; dayFallback: string }): string {
  const fmt = (iso: string, long: boolean) => {
    const d = new Date(`${iso}T12:00:00`)
    if (isNaN(d.getTime())) return iso
    return long
      ? d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
      : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  }
  if (s.nights.length === 0) return s.dayFallback
  if (s.nights.length === 1) return fmt(s.nights[0], true)
  return s.nights.map(n => fmt(n, false)).join(' ✦ ')
}

// Vertical ✦ separator between the side-by-side Department / Primary Role, with
// the line tapering off toward the ends — echoes the mock's ornamental dividers.
function RoleSeparator() {
  return (
    <div aria-hidden style={{ alignSelf: 'stretch', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '2.75rem' }}>
      <span style={{ width: '1px', flex: 1, background: 'linear-gradient(to bottom, transparent, rgba(200,168,72,0.4))' }} />
      <span style={{ color: GOLD, fontSize: '0.6rem', opacity: 0.85, padding: '0.3rem 0' }}>✦</span>
      <span style={{ width: '1px', flex: 1, background: 'linear-gradient(to top, transparent, rgba(200,168,72,0.4))' }} />
    </div>
  )
}

// A medallion + label row — department, role, or a single contribution group.
// `large` bumps the medallion + text (used for the Roles & Responsibilities pair).
function DetailRow({ icon, title, kicker, desc, large, centered }: {
  icon: string
  title: string
  kicker?: string
  desc?: string | null
  large?: boolean
  centered?: boolean
}) {
  const text = (
    <div style={{ minWidth: 0 }}>
      {kicker && <p style={{ fontSize: large ? '0.66rem' : '0.62rem', letterSpacing: '0.16em', textTransform: 'uppercase', color: PURPLE, opacity: 0.9, marginBottom: large ? '0.15rem' : '0.25rem' }}>{kicker}</p>}
      <p style={{ fontSize: large ? '1.1rem' : '0.94rem', color: WARM, lineHeight: 1.25, fontFamily: 'var(--font-cormorant-garamond), serif', fontWeight: 600 }}>{title}</p>
      {desc && <p style={{ fontSize: '0.76rem', color: WARM, opacity: 0.55, fontStyle: 'italic', marginTop: '0.3rem', lineHeight: 1.45, whiteSpace: 'pre-line' }}>{desc}</p>}
    </div>
  )
  if (centered) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '0.6rem', maxWidth: '16rem' }}>
        <IconMedallion icon={icon} size={large ? 70 : 50} />
        {text}
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', alignItems: desc ? 'flex-start' : 'center', gap: large ? '0.7rem' : '0.85rem' }}>
      <IconMedallion icon={icon} size={large ? 70 : 50} />
      {text}
    </div>
  )
}

// Small calendar glyph for the "Member since" line.
function CalendarGlyph() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth="1.8" aria-hidden style={{ opacity: 0.8, flexShrink: 0 }}>
      <rect x="3" y="4.5" width="18" height="17" rx="2.5" />
      <path d="M3 9h18M8 2.5v4M16 2.5v4" strokeLinecap="round" />
    </svg>
  )
}

// Volunteer variant of the public profile — same hero register as a member
// (portrait, name, pronouns), with the shared pill relabelled VOLUNTEER.
// Volunteers carry no roles/groups/distinctions; the page is the hero plus
// the shifts they hold (their whole contribution register).
function VolunteerProfile({ volunteer, heldShifts = [] }: {
  volunteer: { id: string; first_name: string | null; preferred_name: string | null; pronouns: string | null; avatar_url: string | null; created_at: string | null }
  heldShifts?: PublicShift[]
}) {
  const displayName = volunteer.preferred_name || volunteer.first_name || 'Volunteer'
  const sinceYear = volunteer.created_at ? new Date(volunteer.created_at).getFullYear() : null

  return (
    <div style={{ minHeight: '100vh', position: 'relative', zIndex: 1, overflow: 'hidden' }}>
      <Header />
      <style dangerouslySetInnerHTML={{ __html: `
        .pub-hero { display: grid; grid-template-columns: auto 1fr; align-items: center; gap: 2.5rem; }
        .pub-hero-id { min-width: 0; }
        @media (max-width: 720px) {
          .pub-hero { grid-template-columns: 1fr; justify-items: center; text-align: center; gap: 1.4rem; margin-left: 0 !important; }
          .pub-hero-id { text-align: center; }
        }
      ` }} />
      <HandsBackdrop />

      <main aria-labelledby="member-heading" style={{ maxWidth: '1080px', margin: '0 auto', padding: '6rem 1.5rem 7rem', position: 'relative', zIndex: 1 }}>
        <header className="pub-hero" style={{ marginBottom: '0.85rem', marginLeft: '2rem' }}>
          <div style={{
            width: '260px', height: '260px', borderRadius: '50%',
            border: '5px solid #6F491F',
            boxShadow: '0 0 0 1px rgba(60,35,10,0.6), 0 0 20px rgba(111,73,31,0.25), 0 8px 32px rgba(0,0,0,0.55)',
            background: 'rgba(200,168,72,0.08)', overflow: 'hidden', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {volunteer.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={supabaseResizedUrl(volunteer.avatar_url, 520) ?? ''} alt={`${displayName}'s portrait`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <span aria-hidden="true" style={{ fontFamily: 'TokyoDreams, serif', fontSize: '3rem', color: GOLD, opacity: 0.5 }}>
                {displayName.charAt(0).toUpperCase()}
              </span>
            )}
          </div>

          <div className="pub-hero-id">
            <h1 id="member-heading" style={{ fontFamily: 'TokyoDreams, serif', fontSize: 'clamp(2rem, 4.5vw, 3rem)', color: GOLD, margin: '0 0 0.35rem', textShadow: '0 0 40px rgba(210,57,248,0.4)' }}>
              {displayName}
              <span aria-hidden style={{ color: GOLD, fontSize: '0.5em', opacity: 0.8, marginLeft: '0.5rem', verticalAlign: '0.25em' }}>✦</span>
            </h1>
            {volunteer.pronouns && (
              <p style={{ fontSize: '0.9rem', color: PURPLE, opacity: 0.9, margin: '0 0 0.55rem' }}>{volunteer.pronouns}</p>
            )}
            {sinceYear && (
              <p style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.82rem', letterSpacing: '0.05em', color: WARM, opacity: 0.85, margin: '0 0 0.55rem' }}>
                <CalendarGlyph /> Volunteering since {sinceYear}
              </p>
            )}
            <p style={{ fontSize: '0.92rem', color: ROSE, lineHeight: 1.7, maxWidth: '24rem', margin: '0.15rem 0 0' }}>
              Lending a hand at camp — one of the many hands that hold it up.
            </p>
            <div style={{ marginTop: '1rem' }}>
              <ApprovedCamperPill label="VOLUNTEER" />
            </div>
          </div>
        </header>

        {/* ── Shifts — every shift the volunteer holds (their contribution register) ── */}
        <div style={{ marginTop: '0.85rem' }}>
          <ShiftsSection shifts={heldShifts} />
        </div>
      </main>
    </div>
  )
}
