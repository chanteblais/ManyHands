import { catLabel } from './admin-sections'

// Anchored heading that opens each group of sections on the Community, Program,
// and Configure pages. The `id` doubles as the scroll anchor used by AdminNav's
// jump-links. `large` is the Program page's variant — there each heading names
// a whole workspace panel, so it carries more weight.
export function CategoryHeading({ id, large }: { id: string; large?: boolean }) {
  return (
    <h2
      id={id}
      style={{
        scrollMarginTop: '6rem',
        fontFamily: 'var(--font-display)',
        fontSize: large ? '1.5rem' : '1.4rem',
        color: 'var(--gold)',
        opacity: 0.85,
        margin: '3.5rem 0 1.5rem',
        paddingBottom: '0.5rem',
        borderBottom: '1px solid rgb(var(--gold-rgb) / 0.18)',
      }}
    >
      {catLabel(id)}
    </h2>
  )
}
