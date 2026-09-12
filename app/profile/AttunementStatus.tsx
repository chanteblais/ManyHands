'use client'

type AttunementTask = {
  id: string
  label: string
  done: boolean
  section?: 'photo' | 'contribution'
  href?: string
  tier?: 'required' | 'commitment'
}

type Props = {
  tasks: AttunementTask[]
  /** Heading text (uppercased by the header style). Admin-configurable. */
  title?: string
  /** The community-wide shift-hours minimum (authored attunement tasks). */
  minimumHours?: number
  /** Extra hours the member took on via group/role commitments. */
  commitmentHours?: number
}

function Divider() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.48rem 0' }}>
      <span style={{ height: '1.5px', flex: 1, background: 'linear-gradient(90deg, transparent, rgba(122,85,32,0.75), transparent)' }} />
      <span style={{ color: 'rgba(122,85,32,0.95)', fontSize: '0.5rem', lineHeight: 1 }}>◆</span>
      <span style={{ height: '1.5px', flex: 1, background: 'linear-gradient(90deg, transparent, rgba(122,85,32,0.75), transparent)' }} />
    </div>
  )
}

export function AttunementStatus({ tasks, title = 'Attunement Status', minimumHours = 0, commitmentHours = 0 }: Props) {
  // Only the required tier (authored tasks — the community minimum) decides
  // "Attuned". Commitments the member took on by joining groups/roles are a
  // guide to what they signed up for, shown separately, never a blocker.
  const required = tasks.filter(t => t.tier !== 'commitment')
  const commitments = tasks.filter(t => t.tier === 'commitment')

  const allDone = required.every(t => t.done)
  const remaining = required.filter(t => !t.done).length
  const commitmentsRemaining = commitments.filter(t => !t.done).length

  const statusLabel = remaining <= 1 ? 'Nearly Attuned' : 'Still Attuning'

  const TaskRow = ({ task }: { task: AttunementTask }) => {
    const isActionable = !task.done && (task.section || task.href)
    return (
      <div
        onClick={() => {
          if (!task.done && task.section) {
            window.dispatchEvent(new CustomEvent('glaum:open-settings', { detail: { section: task.section } }))
          } else if (!task.done && task.href) {
            if (task.href.startsWith('#')) {
              const id = task.href.slice(1)
              const attempt = () => {
                const target = document.getElementById(id)
                if (target) { target.scrollIntoView({ behavior: 'smooth', block: 'start' }); return true }
                return false
              }
              if (!attempt()) setTimeout(attempt, 100)
            } else {
              window.location.href = task.href
            }
          }
        }}
        style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', padding: '0.42rem 0.4rem', cursor: isActionable ? 'pointer' : 'default', borderRadius: '0.4rem', transition: 'background 0.15s', background: 'transparent' }}
        onMouseEnter={e => { if (isActionable) e.currentTarget.style.background = 'rgba(122,85,32,0.1)' }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
      >
        <div style={{
          width: '1.4rem', height: '1.4rem', borderRadius: '50%', flexShrink: 0,
          border: task.done ? 'none' : '1.25px solid rgba(100,70,25,0.72)',
          background: task.done
            ? 'radial-gradient(circle at 38% 35%, #9C713C, var(--bronze))'
            : 'rgba(255,255,255,0.28)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: task.done ? '0 1px 2px rgba(100,65,20,0.24), inset 0 1px 0 rgba(255,255,255,0.2)' : 'inset 0 0 0 1px rgba(255,255,255,0.32)',
        }}>
          {task.done && (
            <span style={{ fontSize: '0.7rem', color: '#FFF8E7', fontWeight: 700, lineHeight: 1 }}>✓</span>
          )}
        </div>
        <span style={{
          fontSize: '1rem',
          color: task.done ? '#2F1F12' : '#4E3318',
          opacity: task.done ? 0.94 : 0.8,
          lineHeight: 1.35,
          fontFamily: 'var(--font-cormorant-garamond), serif',
          fontWeight: task.done ? 600 : 500,
          letterSpacing: '0.01em',
          textShadow: '0 1px 0 rgba(255,255,255,0.42)',
          flex: 1,
        }}>
          {task.label}
          {isActionable && (
            <span style={{ fontSize: '0.78rem', color: '#9B6A2A', marginLeft: '0.5rem', fontStyle: 'italic' }}>tap to fix →</span>
          )}
        </span>
      </div>
    )
  }

  return (
    <div style={{
      background: 'linear-gradient(145deg, #12031D, #2A0738 48%, #13031E)',
      borderRadius: '1rem',
      padding: '0.42rem',
      border: '1px solid rgba(214,171,82,0.68)',
      boxShadow: '0 0 0 1px rgba(35,8,48,0.95), 0 0 22px rgba(185,72,205,0.18), inset 0 0 0 1px rgba(255,255,255,0.06)',
      position: 'relative',
      overflow: 'hidden',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
    }}>
      <div aria-hidden style={{
        position: 'absolute',
        inset: '0.18rem',
        border: '1px solid rgba(214,171,82,0.48)',
        borderRadius: '0.82rem',
        pointerEvents: 'none',
      }} />
      <div aria-hidden style={{
        position: 'absolute',
        inset: '0.34rem',
        border: '1px solid rgba(82,20,104,0.85)',
        borderRadius: '0.7rem',
        pointerEvents: 'none',
      }} />

      <div style={{
        background: 'radial-gradient(circle at 18% 12%, rgba(255,255,248,0.78), transparent 28%), radial-gradient(circle at 82% 18%, rgba(180,125,54,0.10), transparent 32%), radial-gradient(circle at 58% 86%, rgba(118,68,28,0.10), transparent 34%), linear-gradient(135deg, rgba(255,249,232,0.98), rgba(244,225,190,0.98) 48%, rgba(232,204,158,0.98))',
        borderRadius: '0.68rem',
        border: '1px solid rgba(232,185,91,0.78)',
        boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.42), inset 0 16px 34px rgba(255,255,255,0.25), inset 0 -18px 30px rgba(112,62,20,0.1)',
        overflow: 'hidden',
        color: '#2C1A0E',
        position: 'relative',
        zIndex: 1,
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
      }}>
        <div aria-hidden style={{
          position: 'absolute', inset: 0,
          pointerEvents: 'none',
          opacity: 0.34,
          backgroundImage: 'radial-gradient(rgba(92,54,18,0.22) 0.45px, transparent 0.45px), radial-gradient(rgba(255,255,255,0.34) 0.35px, transparent 0.35px)',
          backgroundSize: '9px 9px, 13px 13px',
          backgroundPosition: '0 0, 4px 7px',
          mixBlendMode: 'multiply',
        }} />
        <div aria-hidden style={{
          position: 'absolute',
          inset: '0.55rem',
          border: '1px solid rgba(214,171,82,0.28)',
          borderRadius: '0.46rem',
          pointerEvents: 'none',
        }} />
        <div aria-hidden style={{
          position: 'absolute',
          inset: '0.78rem',
          border: '1px solid rgba(88,48,18,0.14)',
          borderRadius: '0.34rem',
          pointerEvents: 'none',
        }} />

        {/* Header — ✦ ── ATTUNEMENT STATUS ── ✦ */}
        <div style={{
          padding: '1.3rem 1.2rem 0.5rem',
          position: 'relative',
          zIndex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.7rem',
        }}>
          <span aria-hidden style={{ color: 'rgba(132,92,34,0.82)', fontSize: '0.78rem', lineHeight: 1, textShadow: '0 1px 0 rgba(255,255,255,0.35)' }}>✦</span>
          <span aria-hidden style={{ width: '34px', height: '1px', background: 'linear-gradient(90deg, transparent, rgba(132,92,34,0.55))' }} />
          <p style={{ fontSize: '1rem', letterSpacing: '0.18em', fontWeight: 700, color: '#5A3A14', margin: 0, fontFamily: 'var(--font-cormorant-garamond), serif', textTransform: 'uppercase', WebkitTextStroke: '0.5px #5A3A14', textShadow: '0 1px 0 rgba(255,255,255,0.45)', textAlign: 'center', whiteSpace: 'nowrap' }}>
            {title}
          </p>
          <span aria-hidden style={{ width: '34px', height: '1px', background: 'linear-gradient(90deg, rgba(132,92,34,0.55), transparent)' }} />
          <span aria-hidden style={{ color: 'rgba(132,92,34,0.82)', fontSize: '0.78rem', lineHeight: 1, textShadow: '0 1px 0 rgba(255,255,255,0.35)' }}>✦</span>
        </div>

        <div style={{ padding: '0 1.35rem', position: 'relative', zIndex: 1 }}>
          <Divider />
        </div>

        {/* Required tier — the community minimum; the only items that gate "Attuned". */}
        <div style={{ padding: '0.5rem 1.6rem 0.55rem', position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
         <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
          {required.map(task => <TaskRow key={task.id} task={task} />)}
         </div>
        </div>

        {/* Commitment tier — what the member signed up for beyond the minimum. */}
        {commitments.length > 0 && (
          <div style={{ padding: '0 1.6rem 0.55rem', position: 'relative', zIndex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.35rem 0 0.25rem' }}>
              <span aria-hidden style={{ height: '1px', flex: 1, background: 'linear-gradient(90deg, transparent, rgba(122,85,32,0.45))' }} />
              <p style={{ margin: 0, fontSize: '0.72rem', letterSpacing: '0.16em', textTransform: 'uppercase', color: '#7A5520', opacity: 0.9, fontFamily: 'var(--font-cormorant-garamond), serif', fontWeight: 700 }}>
                Your Commitments
              </p>
              <span aria-hidden style={{ height: '1px', flex: 1, background: 'linear-gradient(90deg, rgba(122,85,32,0.45), transparent)' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem', alignItems: 'stretch' }}>
              {commitments.map(task => <TaskRow key={task.id} task={task} />)}
            </div>
            {commitmentHours > 0 && (
              <p style={{ margin: '0.3rem 0 0', textAlign: 'center', fontSize: '0.82rem', fontStyle: 'italic', color: '#6B4718', opacity: 0.85, fontFamily: 'var(--font-cormorant-garamond), serif' }}>
                {minimumHours > 0 ? `${minimumHours}h is the expectation — ` : ''}you&rsquo;ve pledged {commitmentHours}h more. Many hands indeed.
              </p>
            )}
          </div>
        )}

        <div style={{ padding: '0 1.35rem', position: 'relative', zIndex: 1, marginTop: 'auto' }}>
          <Divider />
        </div>

        {/* Status footer — hand emblem beside the verdict, centered as a unit */}
        <div style={{ padding: '0.55rem 1.4rem 1.15rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1.1rem', position: 'relative', zIndex: 1 }}>
          {/* Emblem: hand in a brass ring, flanked by tiny sparkles */}
          <div style={{ position: 'relative', width: '62px', height: '62px', flexShrink: 0 }}>
            <span aria-hidden style={{ position: 'absolute', top: '0', left: '-5px', color: 'rgba(132,92,34,0.55)', fontSize: '0.55rem' }}>✦</span>
            <span aria-hidden style={{ position: 'absolute', bottom: '3px', right: '-3px', color: 'rgba(132,92,34,0.4)', fontSize: '0.45rem' }}>✦</span>
            <div style={{
              width: '62px', height: '62px', borderRadius: '50%',
              border: '1.5px solid rgba(176,120,42,0.7)',
              background: 'radial-gradient(circle at 42% 36%, rgba(255,249,232,0.9), rgba(232,204,158,0.55))',
              boxShadow: 'inset 0 0 0 3px rgba(255,255,255,0.4), inset 0 0 14px rgba(176,120,42,0.25), 0 2px 6px rgba(112,62,20,0.18)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <img
                src="/handicon.png"
                alt=""
                aria-hidden
                style={{ width: '36px', height: '36px', objectFit: 'contain', opacity: 0.85, filter: 'sepia(0.82) saturate(1.35) brightness(0.72)' }}
              />
            </div>
          </div>
          <div>
            {allDone ? (
              <>
                <p style={{ fontSize: '1.2rem', fontWeight: 700, letterSpacing: '0.08em', color: '#7A4E0E', margin: '0 0 0.2rem', textTransform: 'uppercase', fontFamily: 'var(--font-cormorant-garamond), serif', textShadow: '0 0 12px rgba(180,120,30,0.5), 0 1px 0 rgba(255,255,255,0.3)' }}>
                  Fully Attuned
                </p>
                <p style={{ fontSize: '0.95rem', color: '#5C3D1A', margin: 0, fontFamily: 'var(--font-cormorant-garamond), serif', lineHeight: 1.4 }}>
                  {commitmentsRemaining > 0
                    ? `${commitmentsRemaining} commitment${commitmentsRemaining !== 1 ? 's' : ''} still to fill.`
                    : 'All preparations complete.'}
                </p>
              </>
            ) : (
              <>
                <p style={{ fontSize: '1.2rem', fontWeight: 700, letterSpacing: '0.08em', color: '#7A4E0E', margin: '0 0 0.2rem', textTransform: 'uppercase', fontFamily: 'var(--font-cormorant-garamond), serif', textShadow: '0 0 12px rgba(180,120,30,0.5), 0 1px 0 rgba(255,255,255,0.3)' }}>
                  {statusLabel}
                </p>
                <p style={{ fontSize: '0.95rem', fontWeight: 700, color: '#250838', margin: 0, fontFamily: 'var(--font-cormorant-garamond), serif', lineHeight: 1.4, textShadow: '0 0 8px rgba(150,40,220,0.4), 0 0 18px rgba(150,40,220,0.2), 0 1px 0 rgba(255,255,255,0.35)' }}>
                  {remaining} item{remaining !== 1 ? 's' : ''} require{remaining === 1 ? 's' : ''} attention
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
