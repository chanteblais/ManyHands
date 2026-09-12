import { EventIcon } from '@/components/EventIcon'
import { IconImage, ROUND_FILL } from '@/components/IconImage'
import { isImageIcon } from '@/lib/icon-src'
import type { ContributionType } from '@/lib/application-options'
import { DEFAULT_CONTRIBUTION_TYPES } from '@/lib/application-options'

export type CommitmentShift = { id: string; title: string; day: string; time: string; icon_type: string; event_date: string | null }
export type CommitmentBringing = { id: string; resourceName: string; listTitle: string; quantity: number; icon: string | null }

type Props = {
  contributions: string[]
  role: { name: string; description: string | null; purpose: string | null } | null
  dept: { name: string; icon: string | null } | null
  shifts: CommitmentShift[]
  /** Shared-resource claims ("Camping Stove ×2 · Shared Kitchen"). */
  bringing?: CommitmentBringing[]
  roleApprovalStatus: string | null
  contributionTypes?: ContributionType[]
  showManageLink?: boolean
  title?: string
  compact?: boolean
  /** When true, omit the designation/role row (it lives in the profile header). */
  hideRole?: boolean
}

// Real date ("Saturday, July 25") when the event carries one, else the day name.
// Replaces the old hardcoded July DAY_LABELS map.
function shiftDayLabel(s: CommitmentShift): string {
  if (s.event_date) {
    const d = new Date(`${s.event_date}T12:00:00`)
    if (!isNaN(d.getTime())) return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
  }
  return s.day
}

const TAG_STYLES: Record<string, { color: string; border: string; bg: string }> = {
  GROUP:        { color: 'var(--gold)', border: 'rgb(var(--gold-rgb) / 0.4)', bg: 'rgb(var(--gold-rgb) / 0.08)' },
  TEAM:         { color: 'var(--gold)', border: 'rgb(var(--gold-rgb) / 0.4)', bg: 'rgb(var(--gold-rgb) / 0.08)' },
  LEAD:         { color: 'var(--purple)', border: 'rgb(var(--purple-rgb) / 0.35)', bg: 'rgb(var(--purple-rgb) / 0.07)' },
  DESIGNATION:  { color: 'var(--purple)', border: 'rgb(var(--purple-rgb) / 0.35)', bg: 'rgb(var(--purple-rgb) / 0.07)' },
  SHIFT:        { color: 'var(--success)', border: 'rgba(100,200,120,0.35)', bg: 'rgba(100,200,120,0.07)' },
  BRINGING:     { color: '#8fc4cf', border: 'rgba(120,190,205,0.35)', bg: 'rgba(120,190,205,0.07)' },
}

function CircleIcon({ children, size = '56px' }: { children: React.ReactNode; size?: string }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
      border: '1.5px solid #C07C26',
      background: 'radial-gradient(circle at 42% 38%, rgb(var(--gold-rgb) / 0.14), rgba(8,0,18,0.85))',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {children}
    </div>
  )
}

function Tag({ label }: { label: string }) {
  const s = TAG_STYLES[label] ?? TAG_STYLES.GROUP
  return (
    <span style={{
      fontSize: '0.6rem', letterSpacing: '0.14em', textTransform: 'uppercase',
      color: s.color, border: `1px solid ${s.border}`, background: s.bg,
      borderRadius: '9999px', padding: '0.2rem 0.65rem', flexShrink: 0, whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  )
}

function Row({ circleContent, title, description, tag, iconSize, compact }: {
  circleContent: React.ReactNode
  title: string
  description: string | null
  tag: string
  iconSize?: string
  compact?: boolean
}) {
  return (
    <div className="commitments-row">
      <CircleIcon size={iconSize}>{circleContent}</CircleIcon>
      <div className="commitments-row-text">
        <p style={{ fontSize: '0.74rem', fontWeight: 400, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--parchment)', margin: '0 0 0.15rem', lineHeight: 1.45 }}>
          {title}
        </p>
        {description && !compact && (
          <p style={{ fontSize: '0.66rem', color: '#B0947A', lineHeight: 1.5, margin: 0, whiteSpace: 'pre-line' }}>{description}</p>
        )}
        {description && compact && (
          <p style={{ fontSize: '0.72rem', color: '#B0947A', lineHeight: 1.4, margin: 0, whiteSpace: 'pre-line', opacity: 0.85 }}>{description}</p>
        )}
      </div>
      <Tag label={tag} />
      <span aria-hidden style={{ color: 'var(--gold)', opacity: 0.4, fontSize: '1.2rem', lineHeight: 1, flexShrink: 0, marginLeft: '0.1rem' }}>›</span>
    </div>
  )
}

// Section header: ✦ ── TITLE ── ✦  — the ceremonial accent used across the
// profile cards (mirrors the Attunement Status header treatment).
function AccentHeader({ title, compact }: { title: string; compact?: boolean }) {
  const spark = <span aria-hidden style={{ color: 'var(--gold)', fontSize: '0.7rem', opacity: 0.9, lineHeight: 1 }}>✦</span>
  const line = (dir: 'l' | 'r') => (
    <span aria-hidden style={{ width: '46px', height: '1px', flexShrink: 0, background: `linear-gradient(90deg, ${dir === 'l' ? 'transparent, rgb(var(--gold-rgb) / 0.6)' : 'rgb(var(--gold-rgb) / 0.6), transparent'})` }} />
  )
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.8rem' }}>
      {spark}{line('l')}
      {/* No nowrap: the title is the card's widest content — on a phone it must
          be able to wrap rather than force the card past the viewport. */}
      <p style={{ fontFamily: 'var(--font-cormorant-garamond), serif', fontSize: compact ? '0.92rem' : '1.05rem', fontWeight: 600, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--gold)', margin: 0, textShadow: '0 0 18px rgb(var(--gold-rgb) / 0.35)', textAlign: 'center' }}>
        {title}
      </p>
      {line('r')}{spark}
    </div>
  )
}

export function CommitmentsSection({ contributions, role, dept, shifts, bringing = [], roleApprovalStatus, contributionTypes = DEFAULT_CONTRIBUTION_TYPES, showManageLink = false, title = 'Your Commitments', compact = false, hideRole = false }: Props) {
  const metaByValue = Object.fromEntries(contributionTypes.map(t => [t.value, { icon: t.icon, desc: t.description }]))
  // When the designation lives in the header, this card is groups + shifts only.
  const showRole = role && !hideRole
  const hasAnything = contributions.length > 0 || showRole || shifts.length > 0 || bringing.length > 0
  if (!hasAnything) return null

  const isPending = roleApprovalStatus === 'pending'
  const iconSize = compact ? '44px' : '52px'
  const rowPad = compact ? '0.5rem 0' : '0.55rem 0'
  const rowGap = compact ? '0.75rem' : '1rem'
  const sidepad = compact ? '0 1.25rem' : '0 1.5rem'

  return (
    <div style={{ border: '1.5px solid rgb(var(--gold-rgb) / 0.7)', borderRadius: '1rem', background: 'rgba(10,0,20,0.6)', overflow: 'hidden', boxShadow: '0 0 0 1px rgb(var(--gold-rgb) / 0.12), 0 0 24px rgb(var(--gold-rgb) / 0.08)', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <style dangerouslySetInnerHTML={{ __html: `
        .commitments-rows { padding: ${sidepad}; }
        .commitments-row  { display: flex; align-items: center; gap: ${rowGap}; padding: ${rowPad}; }
        .commitments-row-text { flex: 1; min-width: 0; padding-right: 0.5rem; }
        @media (max-width: 480px) {
          .commitments-rows { padding: 0 1rem; }
          .commitments-row  { gap: 0.6rem; }
          .commitments-row-text { padding-right: 0; }
        }
      ` }} />
      {/* Header */}
      <div style={{ padding: compact ? '0.8rem 1.25rem 0.6rem' : '1rem 1.5rem 0.8rem' }}>
        <AccentHeader title={title} compact={compact} />
      </div>

      {/* Rows */}
      <div className="commitments-rows">
        {/* Role / Designation — shown first (hidden when it lives in the header) */}
        {showRole && role && (
          <div>
            <Row
              circleContent={
                dept?.icon
                  ? isImageIcon(dept.icon)
                    ? <IconImage src={dept.icon} size="100%" fill={ROUND_FILL} opacity={0.85} />
                    : <span style={{ fontSize: compact ? '1.1rem' : '1.4rem', lineHeight: 1 }}>{dept.icon}</span>
                  : <img src="/handicon.png" alt="" aria-hidden style={{ width: '62%', height: '62%', objectFit: 'contain', opacity: 0.85 }} />
              }
              title={isPending ? `${role.name} (pending)` : role.name}
              description={role.description || role.purpose}
              tag="DESIGNATION"
              iconSize={iconSize}
              compact={compact}
            />
            {(contributions.length > 0 || shifts.length > 0 || bringing.length > 0) && (
              <div style={{ height: '1px', background: 'linear-gradient(90deg, transparent, rgb(var(--gold-rgb) / 0.3), transparent)' }} />
            )}
          </div>
        )}

        {/* Contributions */}
        {contributions.map((c, i) => {
          const meta = metaByValue[c] ?? { icon: '✦', desc: null }
          const isImg = typeof meta.icon === 'string' && (meta.icon.startsWith('/') || meta.icon.startsWith('http'))
          return (
            <div key={c}>
              <Row
                circleContent={
                  isImg
                    // eslint-disable-next-line @next/next/no-img-element
                    // CircleIcon clips to a round mask, so the fill must keep the art's
                    // bounding-box corners inside the circle — ROUND_FILL is that bound.
                    ? <IconImage src={meta.icon} size="100%" fill={ROUND_FILL} />
                    : <span style={{ fontSize: compact ? '1.1rem' : '1.4rem', lineHeight: 1 }}>{meta.icon}</span>
                }
                title={c}
                description={meta.desc}
                tag="GROUP"
                iconSize={iconSize}
                compact={compact}
              />
              {(i < contributions.length - 1 || shifts.length > 0 || bringing.length > 0) && (
                <div style={{ height: '1px', background: 'linear-gradient(90deg, transparent, rgb(var(--gold-rgb) / 0.3), transparent)' }} />
              )}
            </div>
          )
        })}

        {/* Shifts — every shift the member holds */}
        {shifts.map((shift, i) => (
          <div key={shift.id}>
            <Row
              circleContent={
                isImageIcon(shift.icon_type)
                  // Image icons render exactly like the group rows above (same fill,
                  // full opacity) so every circle in the card carries the same weight.
                  // EventIcon's 1.5x box would overfill the ring (effective fill ~0.91).
                  ? <IconImage src={shift.icon_type} size="100%" fill={ROUND_FILL} />
                  // display:flex — an inline line box here baseline-shifts the icon
                  // ~2px above the circle's center.
                  : <div style={{ color: 'var(--gold)', opacity: 0.75, display: 'flex' }}>
                      <EventIcon type={shift.icon_type} size={compact ? 28 : 36} />
                    </div>
              }
              title={shift.title}
              description={`${shiftDayLabel(shift)}\n${shift.time}`}
              tag="SHIFT"
              iconSize={iconSize}
              compact={compact}
            />
            {(i < shifts.length - 1 || bringing.length > 0) && (
              <div style={{ height: '1px', background: 'linear-gradient(90deg, transparent, rgb(var(--gold-rgb) / 0.3), transparent)' }} />
            )}
          </div>
        ))}

        {/* Shared resources the member has claimed ("I'll bring one") */}
        {bringing.map((b, i) => (
          <div key={b.id}>
            <Row
              circleContent={
                b.icon && isImageIcon(b.icon)
                  // Same sizing rule as the group icon rows above.
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <IconImage src={b.icon} size="100%" fill={ROUND_FILL} />
                  : <span style={{ fontSize: compact ? '1.1rem' : '1.4rem', lineHeight: 1, color: '#8fc4cf', opacity: 0.85 }}>✦</span>
              }
              title={b.quantity > 1 ? `${b.resourceName} ×${b.quantity}` : b.resourceName}
              description={b.listTitle || null}
              tag="BRINGING"
              iconSize={iconSize}
              compact={compact}
            />
            {i < bringing.length - 1 && (
              <div style={{ height: '1px', background: 'linear-gradient(90deg, transparent, rgb(var(--gold-rgb) / 0.3), transparent)' }} />
            )}
          </div>
        ))}
      </div>

      {/* Footer */}
      {showManageLink && (
        <div style={{ padding: '0.5rem 1.5rem 1rem', textAlign: 'center', marginTop: 'auto' }}>
          <a href="/participate" style={{ fontFamily: 'var(--font-cormorant-garamond), serif', fontSize: '0.72rem', letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--gold)', opacity: 0.85, textDecoration: 'none', borderBottom: '1px solid rgb(var(--gold-rgb) / 0.35)', paddingBottom: '0.2rem' }}>
            View all commitments ›
          </a>
        </div>
      )}
    </div>
  )
}
