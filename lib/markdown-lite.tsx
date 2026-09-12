import React from 'react'

// ── Lightweight rich-text for admin-authored copy ────────────────────────────
// Supports paragraphs (blank-line separated), bullet lists (lines starting with
// *, -, • or ✦), links ([text](url) and bare URLs), and **bold**. No deps.
// Shared by the application form's text-block elements (app/apply/ApplyWizard),
// the profile's custom text blocks + editable Camp Info body, and the builders.

const GOLD = 'var(--gold)'
const CREAM = 'var(--cream)'

export function renderInline(text: string): React.ReactNode[] {
  const linkStyle: React.CSSProperties = { color: GOLD, textDecoration: 'underline', textUnderlineOffset: '2px' }
  const nodes: React.ReactNode[] = []
  const re = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s)]+)|\*\*([^*]+)\*\*/g
  let last = 0
  let key = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index))
    if (m[1] && m[2]) {
      nodes.push(<a key={key++} href={m[2]} target="_blank" rel="noopener noreferrer" style={linkStyle}>{m[1]}</a>)
    } else if (m[3]) {
      // Trim trailing sentence punctuation off bare URLs.
      const trail = m[3].match(/[.,;:!?]+$/)?.[0] ?? ''
      const url = trail ? m[3].slice(0, -trail.length) : m[3]
      nodes.push(<a key={key++} href={url} target="_blank" rel="noopener noreferrer" style={linkStyle}>{url}</a>)
      if (trail) nodes.push(trail)
    } else if (m[4]) {
      nodes.push(<strong key={key++}>{m[4]}</strong>)
    }
    last = m.index + m[0].length
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

// `baseStyle` overrides the per-paragraph/list-item text style; `wrapperStyle`
// overrides the outer container. Defaults match the application form's original
// look so existing callers render identically.
export function RichText({ text, baseStyle, wrapperStyle }: {
  text: string
  baseStyle?: React.CSSProperties
  wrapperStyle?: React.CSSProperties
}) {
  const blocks = text.trim().split(/\n\s*\n/).filter(Boolean)
  const base: React.CSSProperties = { fontSize: '0.92rem', lineHeight: 1.8, color: CREAM, opacity: 0.7, ...baseStyle }
  return (
    <div style={{ marginBottom: '2rem', ...wrapperStyle }}>
      {blocks.map((block, bi) => {
        const lines = block.split('\n').map(l => l.trim()).filter(Boolean)
        const isList = lines.length > 0 && lines.every(l => /^[*\-•✦]\s+/.test(l))
        if (isList) {
          return (
            <ul key={bi} style={{ listStyle: 'none', padding: 0, margin: '0 0 1.1rem', display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
              {lines.map((l, li) => (
                <li key={li} style={{ ...base, display: 'flex', gap: '0.65rem', alignItems: 'flex-start' }}>
                  <span style={{ color: GOLD, flexShrink: 0, opacity: 0.85, marginTop: '0.05rem' }}>✦</span>
                  <span>{renderInline(l.replace(/^[*\-•✦\s]+/, ''))}</span>
                </li>
              ))}
            </ul>
          )
        }
        return <p key={bi} style={{ ...base, margin: '0 0 1.1rem' }}>{renderInline(block.replace(/\n/g, ' '))}</p>
      })}
    </div>
  )
}
