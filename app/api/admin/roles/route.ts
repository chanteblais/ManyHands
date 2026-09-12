import { NextRequest, NextResponse } from 'next/server'
import { tenantDb } from '@/lib/tenant-db'
import { getCommunity } from '@/lib/community'
import { requireAdmin } from '@/lib/admin-auth'

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const community = await getCommunity()
  const db = tenantDb(community.id)

  const { data, error } = await db
    .from('roles')
    .select('id, name, description, capacity, sort_order, department_id, purpose, responsibilities_before, responsibilities_during, ideal_for, commitment, commitment_period, requires_approval, required_shift_type_id, required_shift_hours')
    .order('sort_order', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ roles: data ?? [] })
}

export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const community = await getCommunity()
  const db = tenantDb(community.id)

  const body = await req.json()
  const { name, description, capacity, sort_order, department_id, purpose, responsibilities_before, responsibilities_during, ideal_for, commitment, commitment_period, requires_approval, required_shift_type_id, required_shift_hours } = body

  if (!name || capacity == null || !department_id) {
    return NextResponse.json({ error: 'name, capacity, and department_id are required' }, { status: 400 })
  }

  const { data, error } = await db
    .from('roles')
    .insert({ name, description: description ?? null, capacity, sort_order: sort_order ?? 0, department_id, purpose: purpose ?? null, responsibilities_before: responsibilities_before ?? null, responsibilities_during: responsibilities_during ?? null, ideal_for: ideal_for ?? null, commitment: commitment ?? null, commitment_period: commitment_period ?? null, requires_approval: requires_approval ?? false, required_shift_type_id: required_shift_type_id || null, required_shift_hours: required_shift_hours === '' || required_shift_hours == null ? null : Number(required_shift_hours) })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ role: data })
}
