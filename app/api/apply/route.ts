import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getCommunity } from '@/lib/community'
import { tenantDb } from '@/lib/tenant-db'
import { notifyAdmin } from '@/lib/notify-admin'
import { upsertMember } from '@/lib/members'
import { parseProfileFields, storedFields, applicationFields, coerceProfileValue } from '@/lib/profile-fields'
import { sendGroupWelcome } from '@/lib/conversations'

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const community = await getCommunity()
  const db = tenantDb(community.id)

  try {
    // A prior application only blocks re-applying if it's still active. A
    // *cancelled* application is treated as "no application" everywhere else
    // (profile/apply pages), so it must not block — we revive it below instead.
    const { data: existing } = await db
      .from('applications')
      .select('id, status')
      .eq('clerk_user_id', userId)
      .maybeSingle()

    if (existing && existing.status !== 'cancelled') {
      return NextResponse.json({ error: 'Application already submitted' }, { status: 409 })
    }

    const data = await req.json()

    const record = {
      clerk_user_id: userId,
      avatar_url: data.avatar_url || null,

      // Section 1 — Basic Info
      first_name: data.first_name,
      last_name: data.last_name,
      preferred_name: data.preferred_name || null,
      pronouns: data.pronouns || null,
      email: data.email,
      phone: data.phone,
      instagram: data.instagram || null,
      location: data.location || null,
      emergency_contact: data.emergency_contact || null,
      referral: data.referral || null,
      camped_before: data.camped_before,

      // Section 2 — About You
      about_you: data.about_you || null,
      community_acceptance: data.community_acceptance || null,
      special_skills: data.special_skills || null,
      recent_achievements: data.recent_achievements || null,
      official_designation: data.official_designation || null,
      research_interests: data.research_interests || null,
      known_side_effects: data.known_side_effects || null,
      onboarding_status: data.onboarding_status || [],
      onboarding_status_other: data.onboarding_status_other || null,

      // Section 3 — Event Plans
      attendance: data.attendance,
      arrival_date: data.arrival_date || null,
      departure_date: data.departure_date || null,
      membership_type: data.membership_type,
      vehicle: data.vehicle || null,
      space_requirements: data.space_requirements || null,
      structures: data.structures || null,
      rideshare: data.rideshare || null,

      // Section 2 (wizard) — new fields
      find_at_camp: data.find_at_camp || null,

      // Section 4 — Participation
      department_interests: data.department_interests || [],
      leadership_interest: data.leadership_interest || null,
      setup_available: data.setup_available || null,
      setup_limitations: data.setup_limitations || [],
      setup_notes: data.setup_notes || null,
      community_contribution: data.community_contribution || null,
      welcome_support: data.welcome_support || null,
      leadership_note: data.leadership_note || null,
      skills_contribution: data.skills_contribution || null,

      // Section 5 — Community Culture
      draws_to_community: data.draws_to_community || null,
      healthy_community: data.healthy_community || null,

      // Section 6 — Contribution Expectations
      acknowledgements: data.acknowledgements || [],

      // Section 7 — Final Glåüm Questions
      shrimp_relationship: data.shrimp_relationship || null,

      // Custom sections (admin-added)
      custom_answers:
        data.custom_answers && Object.keys(data.custom_answers).length > 0
          ? data.custom_answers
          : null,

      status: 'pending',
    }

    // Revive a previously cancelled application in place (clearing its review /
    // cancellation state) rather than inserting a second row — the rest of the app
    // assumes one application row per clerk_user_id. Otherwise insert a new one.
    const { data: inserted, error } = existing
      ? await db
          .from('applications')
          .update({
            ...record,
            submitted_at: new Date().toISOString(),
            cancel_reason: null,
            cancelled_at: null,
            reviewed_at: null,
            reviewed_by: null,
          })
          .eq('id', existing.id)
          .select('id')
          .single()
      : await db
          .from('applications')
          .insert([record])
          .select('id')
          .single()

    if (error) {
      console.error('Supabase error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Optional group opt-in — add the applicant to selected groups, but only ones
    // actually offered by a visible "Group selection" field in the member form
    // config (a field with unset `options` offers every group).
    if (Array.isArray(data.group_choices) && data.group_choices.length > 0) {
      const { data: cfgRow } = await db
        .from('page_content')
        .select('value')
        .eq('key', 'config_member_form')
        .maybeSingle()

      let allowAll = false
      const explicitIds = new Set<string>()
      try {
        const cfg = cfgRow?.value
          ? (JSON.parse(cfgRow.value) as { steps?: { fields?: { type?: string; visible?: boolean; options?: string[] }[] }[] })
          : null
        for (const step of cfg?.steps ?? []) {
          for (const f of step.fields ?? []) {
            if (f?.type !== 'group_select' || f.visible === false) continue
            if (f.options === undefined || f.options === null) allowAll = true
            else for (const id of f.options) explicitIds.add(id)
          }
        }
      } catch { /* malformed config → no groups allowed */ }

      if (allowAll || explicitIds.size > 0) {
        const { data: validGroups } = await db
          .from('groups')
          .select('id')
          .in('id', data.group_choices)
        const rows = (validGroups ?? [])
          .filter(g => allowAll || explicitIds.has(g.id))
          .map(g => ({ group_id: g.id, clerk_user_id: userId, source: 'application' }))
        if (rows.length > 0) {
          const { data: insertedRows, error: gmError } = await db
            .from('group_members')
            .upsert(rows, { onConflict: 'group_id,clerk_user_id', ignoreDuplicates: true })
            .select('group_id')
          if (gmError) console.error('group_members insert error:', gmError)
          // Private welcome note per fresh membership — sits unread until the
          // applicant is approved and can open their inbox.
          await Promise.all((insertedRows ?? []).map(r => sendGroupWelcome(r.group_id, userId)))
        }
      }
    }

    // Phase 3: registry-bound fields populate the canonical profile under their
    // Profile Field key. Validate against the registry exactly like the member
    // self-edit path (application-eligible fields only, options/type coerced) so
    // this writer can't slip out-of-vocabulary values into member_profiles. The
    // raw answers stay on the application row (custom_answers) untouched.
    let profileValues: Record<string, unknown> | undefined
    if (data.profile_values && typeof data.profile_values === 'object') {
      const { data: registryRow } = await db
        .from('page_content')
        .select('value')
        .eq('key', 'config_profile_fields')
        .maybeSingle()
      const eligible = new Map(
        applicationFields(storedFields(parseProfileFields(registryRow?.value))).map(f => [f.key, f]),
      )
      const coerced: Record<string, unknown> = {}
      for (const [key, raw] of Object.entries(data.profile_values as Record<string, unknown>)) {
        const field = eligible.get(key)
        if (!field) continue // unknown / non-application field → snapshot-only
        coerced[key] = coerceProfileValue(field, raw)
      }
      if (Object.keys(coerced).length > 0) profileValues = coerced
    }

    // Phase 1 dual-write: mirror identity to the canonical `members` table and
    // seed the profile from the already-keyed custom answers. Guarded inside
    // upsertMember — a failure here must never break the application submission.
    await upsertMember(
      community.id,
      userId,
      {
        email: data.email,
        first_name: data.first_name,
        last_name: data.last_name,
        preferred_name: data.preferred_name || null,
        pronouns: data.pronouns || null,
        phone: data.phone,
        avatar_url: data.avatar_url || null,
        status: 'pending',
        application_id: inserted?.id ?? null,
      },
      profileValues,
    )

    const displayName = [data.preferred_name || data.first_name, data.last_name].filter(Boolean).join(' ')
    await notifyAdmin(community, {
      eventType: 'new_application',
      applicationId: inserted?.id ?? null,
      message: `New application from ${displayName}`,
      details: { email: data.email },
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Apply route error:', err)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
