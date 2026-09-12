type Task = {
  id: string
  label: string
  done: boolean
  pending?: boolean   // in-progress but not actionable (e.g. awaiting admin)
  href?: string
  cta?: string
  note?: string
}

type Props = {
  track: 'pending' | 'volunteer'
  volunteerStatus?: string | null
}

export function TaskStatus({ track, volunteerStatus }: Props) {
  const tasks: Task[] = []

  if (track === 'pending') {
    tasks.push({ id: 'submitted', label: 'Application submitted', done: true })
    tasks.push({
      id: 'review',
      label: 'Awaiting review',
      done: false,
      pending: true,
      note: "You'll receive an email once your application has been reviewed.",
    })
  }

  if (track === 'volunteer') {
    tasks.push({ id: 'signed-up', label: 'Volunteer signup complete', done: true })

    if (volunteerStatus === 'pending') {
      tasks.push({
        id: 'approval',
        label: 'Awaiting admin approval',
        done: false,
        pending: true,
        note: "You'll receive a notification once your signup has been reviewed.",
      })
    } else {
      // Roles & shifts are member self-serve only (/participate is gated on an
      // approved members row) — volunteers are coordinated by organizers, who
      // see each signup's intents and shift interests in Admin → Volunteers.
      tasks.push({
        id: 'outreach',
        label: "We'll reach out with ways to contribute",
        done: false,
        pending: true,
        note: "Keep an eye on your email — we'll be in touch as the event gets closer.",
      })
    }
  }

  const isAllCaughtUp = tasks.every(t => t.done) && track !== 'pending'

  return (
    <div style={{
      marginBottom: '2rem',
      padding: '1.25rem 1.5rem',
      borderRadius: '1rem',
      border: isAllCaughtUp
        ? '1px solid rgba(100,200,120,0.25)'
        : '1px solid rgb(var(--gold-rgb) / 0.2)',
      background: isAllCaughtUp
        ? 'rgba(100,200,120,0.04)'
        : 'rgb(var(--gold-rgb) / 0.04)',
    }}>
      <p style={{
        fontSize: '0.65rem',
        letterSpacing: '0.25em',
        textTransform: 'uppercase',
        color: isAllCaughtUp ? 'var(--success)' : 'var(--gold)',
        opacity: 0.7,
        marginBottom: '1rem',
      }}>
        {isAllCaughtUp ? 'All caught up' : "What's next"}
      </p>

      {isAllCaughtUp ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <span style={{ color: 'var(--success)', fontSize: '1rem' }}>✓</span>
          <span style={{ fontSize: '0.9rem', color: 'var(--success)' }}>
            You're all set. Nothing left to do for now.
          </span>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {tasks.map(task => (
            <div key={task.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
              {/* Status dot */}
              <div style={{
                width: '1.1rem',
                height: '1.1rem',
                borderRadius: '50%',
                flexShrink: 0,
                marginTop: '0.1rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: task.done
                  ? 'none'
                  : task.pending
                  ? '1.5px solid rgb(var(--purple-rgb) / 0.5)'
                  : '1.5px solid rgb(var(--gold-rgb) / 0.5)',
                background: task.done ? 'rgba(100,200,120,0.15)' : 'transparent',
              }}>
                {task.done && <span style={{ fontSize: '0.6rem', color: 'var(--success)' }}>✓</span>}
                {task.pending && <span style={{ fontSize: '0.55rem', color: 'var(--purple)' }}>○</span>}
              </div>

              {/* Label + note + CTA */}
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                  <span style={{
                    fontSize: '0.875rem',
                    color: task.done ? 'var(--cream)' : task.pending ? 'var(--purple)' : 'var(--gold)',
                    opacity: task.done ? 0.45 : 1,
                    textDecoration: task.done ? 'line-through' : 'none',
                  }}>
                    {task.label}
                  </span>
                  {!task.done && !task.pending && task.href && task.cta && (
                    <a
                      href={task.href}
                      style={{
                        fontSize: '0.78rem',
                        color: 'var(--gold)',
                        opacity: 0.75,
                        textDecoration: 'underline',
                        textUnderlineOffset: '2px',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {task.cta}
                    </a>
                  )}
                </div>
                {task.note && (
                  <p style={{ fontSize: '0.78rem', opacity: 0.45, marginTop: '0.2rem', lineHeight: 1.5 }}>
                    {task.note}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
