type Props = {
  roleName: string
  deptName: string | null
  deptIcon: string | null
}

export function RoleBadge({ roleName, deptName, deptIcon }: Props) {
  return (
    <div style={{ position: 'relative', width: '160px', height: '214px', flexShrink: 0 }}>
      <svg width="160" height="214" style={{ position: 'absolute', inset: 0, overflow: 'visible' }} aria-hidden>
        <defs>
          <radialGradient id="rb_fill" cx="50%" cy="36%" r="58%" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#2e0850" />
            <stop offset="100%" stopColor="#0c0018" />
          </radialGradient>
          <linearGradient id="rb_rim" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%"   stopColor="#7a5a10" />
            <stop offset="20%"  stopColor="var(--gold)" />
            <stop offset="45%"  stopColor="#f0d878" />
            <stop offset="70%"  stopColor="#b8940c" />
            <stop offset="100%" stopColor="#7a5a10" />
          </linearGradient>
        </defs>

        <ellipse cx="80" cy="107" rx="76" ry="103" fill="url(#rb_fill)" />
        <ellipse cx="81" cy="109" rx="76" ry="103" fill="none" stroke="rgba(0,0,0,0.5)" strokeWidth="5" />
        <ellipse cx="80" cy="107" rx="76" ry="103" fill="none" stroke="url(#rb_rim)" strokeWidth="4" />
        <ellipse cx="80" cy="107" rx="76" ry="103" fill="none" stroke="rgba(255,240,160,0.3)" strokeWidth="1.5" />
        <ellipse cx="80" cy="107" rx="68" ry="95"
          fill="none" stroke="var(--gold)" strokeWidth="1.5"
          strokeDasharray="0.1 5.2" strokeLinecap="round" opacity="0.65"
        />
      </svg>

      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        textAlign: 'center', padding: '0 26px',
      }}>
        <img src="/handicon.png" alt="" aria-hidden
          style={{ width: '40px', height: '40px', objectFit: 'contain', marginBottom: '8px', display: 'block' }}
        />

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', width: '100%', marginBottom: '8px' }}>
          <div style={{ flex: 1, height: '1px', background: 'rgb(var(--gold-rgb) / 0.45)' }} />
          <span style={{ fontSize: '0.38rem', color: 'var(--gold)', opacity: 0.75, lineHeight: 1 }}>✦</span>
          <div style={{ flex: 1, height: '1px', background: 'rgb(var(--gold-rgb) / 0.45)' }} />
        </div>

        <p style={{
          fontFamily: 'var(--font-display)',
          fontSize: '1rem',
          color: '#e8cc6a',
          margin: '0 0 8px',
          lineHeight: 1.2,
          letterSpacing: '0.06em',
          textShadow: '0 0 16px rgb(var(--gold-rgb) / 0.55)',
          textTransform: 'uppercase',
        }}>
          {roleName}
        </p>

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', width: '100%', marginBottom: '8px' }}>
          <div style={{ flex: 1, height: '1px', background: 'rgb(var(--gold-rgb) / 0.45)' }} />
          <span style={{ fontSize: '0.38rem', color: 'var(--gold)', opacity: 0.75, lineHeight: 1 }}>✦</span>
          <div style={{ flex: 1, height: '1px', background: 'rgb(var(--gold-rgb) / 0.45)' }} />
        </div>

        {deptName && (
          <p style={{
            fontSize: '0.5rem', letterSpacing: '0.16em', textTransform: 'uppercase',
            color: 'var(--gold)', opacity: 0.65, margin: '0 0 8px', lineHeight: 1.7,
          }}>
            {deptName}
          </p>
        )}

        <span style={{ fontSize: '0.55rem', color: 'var(--gold)', opacity: 0.5, lineHeight: 1 }}>✦</span>
      </div>
    </div>
  )
}
