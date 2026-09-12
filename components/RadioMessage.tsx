// Renders a radio post line, lighting `**…**` spans gold — the entity the
// moment is about ("Sarah is bringing a **camping stove**."). When `href` is
// given, the lit entities are the hyperlink (the story's noun is the way in,
// not an invisible whole-row link). Pure and import-safe from both server
// components (home teaser) and client ones (the /radio feed). Not markdown —
// just the one highlight convention.

export function RadioMessage({ text, href, gold = 'var(--gold)' }: {
  text: string
  href?: string | null
  gold?: string
}) {
  const parts = text.split('**')
  // Odd indexes sit inside a **…** pair. A balanced string splits into an odd
  // number of parts; when the count is even, the final ** was never closed —
  // that trailing part renders plain (with its ** restored).
  const balanced = parts.length % 2 === 1
  return (
    <>
      {parts.map((part, i) => {
        const isLast = i === parts.length - 1
        if (i % 2 === 1 && (balanced || !isLast)) {
          return href ? (
            <a
              key={i}
              href={href}
              style={{
                color: gold,
                textDecoration: 'underline',
                textDecorationColor: 'rgb(var(--gold-rgb) / 0.35)',
                textUnderlineOffset: '3px',
              }}
            >
              {part}
            </a>
          ) : (
            <span key={i} style={{ color: gold }}>{part}</span>
          )
        }
        return <span key={i}>{i % 2 === 1 && isLast ? `**${part}` : part}</span>
      })}
    </>
  )
}
