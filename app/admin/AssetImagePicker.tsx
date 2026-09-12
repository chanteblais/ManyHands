'use client'

import { useRef, useState } from 'react'
import {
  BUILTIN_ASSETS,
  builtinAssets,
  orderedCategories,
  type AssetCategory,
  type AssetLibraryItem,
} from '@/lib/asset-library'
import { isImageIcon } from '@/lib/icon-src'
import { iconDisplaySrc } from '@/components/IconImage'

// Reusable image picker backed by the asset library. A compact trigger shows the
// current selection and opens a modal grouped into categories (Distinctions,
// Icons, …). The `primaryCategory` tab shows first but the rest stay browsable,
// so a distinction picker leads with badges and a department/icon picker leads
// with icons — both can reach the other. Choose an included image or upload your
// own (POSTed to `uploadUrl`). Shared by DistinctionsManager + DepartmentsManager.

export type GroupIconOption = { name: string; image: string }

// Tabs in the picker: the built-in library categories, plus a synthetic 'group'
// tab for the community's reusable group icons (kept separate from built-in Icons
// so the same art never shows under both).
type PickTab = AssetCategory | 'group'

const CREAM = 'var(--cream)'
const selectStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.04)', border: '1px solid rgb(var(--gold-rgb) / 0.2)',
  borderRadius: '0.3rem', color: CREAM, fontSize: '0.75rem',
  padding: '0.2rem 0.4rem', outline: 'none', fontFamily: 'inherit',
}
const tinyLabel: React.CSSProperties = {
  fontSize: '0.62rem', opacity: 0.4, letterSpacing: '0.08em',
  textTransform: 'uppercase', whiteSpace: 'nowrap',
}

// Image sizing inside a tile/preview. All library art sits on the standard
// normalized frame (lib/icon-image.ts), so both modes size by HEIGHT and let
// the frame's wide margins clip: `fill` = the Cabinet-medal scale for circular
// badge art; `contain` = the icon scale (art ~80% of the tile).
type TileFit = 'fill' | 'contain'
function tileImgStyle(fit: TileFit): React.CSSProperties {
  return fit === 'fill'
    ? { height: '132%', width: 'auto', maxWidth: 'none', display: 'block' }
    : { height: '110%', width: 'auto', maxWidth: 'none', display: 'block' }
}

// A single selectable thumbnail.
function AssetTile({ src, label, selected, onClick, fit = 'contain' }: {
  src: string
  label: string
  selected: boolean
  onClick: () => void
  fit?: TileFit
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      style={{ width: 60, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
    >
      <span style={{
        width: 60, height: 60, borderRadius: '0.5rem', overflow: 'hidden',
        background: 'rgba(8,0,18,0.6)',
        border: selected ? '2px solid var(--gold)' : '1px solid rgb(var(--gold-rgb) / 0.2)',
        boxShadow: selected ? '0 0 0 1px rgb(var(--gold-rgb) / 0.4)' : 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={iconDisplaySrc(src)} alt="" style={tileImgStyle(fit)} />
      </span>
      <span style={{ fontSize: '0.55rem', color: CREAM, opacity: selected ? 0.95 : 0.55, maxWidth: 60, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', letterSpacing: '0.02em' }}>
        {label}
      </span>
    </button>
  )
}

export function AssetImagePicker({
  value, onChange, uploadUrl, groupIconOptions = [], primaryCategory = 'distinction', label = 'Image',
}: {
  value: string | undefined
  onChange: (url: string | undefined) => void
  /** Endpoint the "Upload your own" file is POSTed to (field name `icon`). */
  uploadUrl: string
  groupIconOptions?: GroupIconOption[]
  primaryCategory?: AssetCategory
  label?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<PickTab>(primaryCategory)

  async function upload(file: File) {
    setBusy(true); setErr(null)
    const fd = new FormData()
    fd.append('icon', file)
    const res = await fetch(uploadUrl, { method: 'POST', body: fd })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { setErr(data.error ?? 'Upload failed'); setBusy(false); return }
    // Icon endpoints return the URL under `image` (distinctions/departments),
    // `icon_image` (groups), or `url` (schedule) — accept any so this picker is
    // endpoint-agnostic.
    onChange(data.image ?? data.icon_image ?? data.url)
    setBusy(false)
    setOpen(false)
    if (inputRef.current) inputRef.current.value = ''
  }

  type PickItem = { key: string; src: string; label: string; cat: AssetCategory }
  // The Groups tab lists the community's reusable group icons (admin-named, so
  // already generic). A group whose icon IS a built-in library image is dropped —
  // that art already sits under its own category tab — and groups sharing one
  // uploaded image collapse to a single tile, so no art ever shows twice.
  const builtinSrcs = new Set(BUILTIN_ASSETS.map(a => a.src))
  const seenGroupSrcs = new Set<string>()
  const uniqueGroupIcons = groupIconOptions.filter(g => {
    if (builtinSrcs.has(g.image) || seenGroupSrcs.has(g.image)) return false
    seenGroupSrcs.add(g.image)
    return true
  })

  // Items shown for a tab. Built-in category tabs draw from the shipped library;
  // the synthetic 'group' tab from the deduped group icons. Group icons render
  // like icons (contain).
  function itemsFor(tab: PickTab): PickItem[] {
    if (tab === 'group') {
      return uniqueGroupIcons.map(g => ({ key: `group-${g.image}`, src: g.image, label: g.name, cat: 'icon' as AssetCategory }))
    }
    return builtinAssets(tab).map((a: AssetLibraryItem) => ({ key: a.id, src: a.src, label: a.label, cat: tab }))
  }

  // Built-in category tabs, plus a "Groups" tab only when there are group icons
  // left after filtering out built-ins.
  const tabs: { value: PickTab; label: string }[] = [
    ...orderedCategories(primaryCategory),
    ...(uniqueGroupIcons.length ? [{ value: 'group' as PickTab, label: 'Groups' }] : []),
  ]
  const allItems = tabs.flatMap(t => itemsFor(t.value))
  const selected = value ? allItems.find(i => i.src === value) : undefined
  const selectedLabel = value ? (selected?.label ?? '') : 'No image'
  const activeItems = itemsFor(activeTab)
  // Badges (padded circular art) fill; icons/group uploads use contain so nothing crops.
  const fitFor = (cat: AssetCategory | undefined): TileFit => (cat === 'distinction' ? 'fill' : 'contain')
  const activeFit = fitFor(activeTab === 'group' ? 'icon' : activeTab)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
      <span style={tinyLabel}>{label}</span>

      {/* Trigger: current selection + open button */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
        <span style={{
          width: 52, height: 52, flexShrink: 0, borderRadius: '0.5rem', overflow: 'hidden',
          background: 'rgba(8,0,18,0.6)', border: '1px solid rgb(var(--gold-rgb) / 0.25)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {!value
            ? <span style={{ fontSize: '0.55rem', opacity: 0.3 }}>—</span>
            : isImageIcon(value)
              ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={iconDisplaySrc(value)} alt="" style={tileImgStyle(fitFor(selected?.cat))} />
              /* Legacy non-image value (e.g. an emoji) — render as text. */
              : <span style={{ fontSize: '1.4rem', lineHeight: 1 }}>{value}</span>}
        </span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: 0 }}>
          {selectedLabel && <span style={{ fontSize: '0.78rem', color: CREAM, opacity: 0.85, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedLabel}</span>}
          <div style={{ display: 'flex', gap: '0.6rem' }}>
            <button
              type="button"
              onClick={() => { setActiveTab(primaryCategory); setErr(null); setOpen(true) }}
              style={{ ...selectStyle, cursor: 'pointer', color: 'var(--lemon)' }}
            >
              {value ? 'Change image' : 'Choose image'}
            </button>
            {value && (
              <button
                type="button"
                onClick={() => onChange(undefined)}
                title="Use no image"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: CREAM, opacity: 0.4, fontSize: '0.7rem', textDecoration: 'underline', padding: 0 }}
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Modal asset library */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: 'var(--ink)', border: '1px solid rgb(var(--gold-rgb) / 0.5)', borderRadius: '0.75rem', width: 'min(560px, 100%)', maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.6)' }}
          >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.9rem 1.1rem', borderBottom: '1px solid rgb(var(--gold-rgb) / 0.2)' }}>
              <span style={{ fontFamily: 'var(--font-cormorant-garamond), serif', fontSize: '1rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--gold)' }}>Choose an image</span>
              <button type="button" onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: CREAM, opacity: 0.6, fontSize: '1.1rem', lineHeight: 1, padding: '0.2rem' }}>×</button>
            </div>

            {/* Category tabs */}
            <div style={{ display: 'flex', gap: '0.4rem', padding: '0.7rem 1.1rem 0.4rem', flexWrap: 'wrap' }}>
              {tabs.map(t => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setActiveTab(t.value)}
                  style={{
                    border: '1px solid rgb(var(--gold-rgb) / 0.3)', borderRadius: '9999px', cursor: 'pointer',
                    padding: '0.25rem 0.85rem', fontSize: '0.72rem', letterSpacing: '0.04em',
                    background: activeTab === t.value ? 'var(--gold)' : 'transparent',
                    color: activeTab === t.value ? 'var(--ink)' : CREAM,
                    fontWeight: activeTab === t.value ? 600 : 400,
                    opacity: activeTab === t.value ? 1 : 0.7,
                  }}
                >{t.label}</button>
              ))}
            </div>

            {/* Grid */}
            <div style={{ padding: '0.5rem 1.1rem 0.9rem', overflowY: 'auto', display: 'flex', flexWrap: 'wrap', gap: '0.7rem', alignContent: 'flex-start' }}>
              {activeItems.length === 0 ? (
                <span style={{ fontSize: '0.78rem', opacity: 0.45, fontStyle: 'italic', padding: '1rem 0' }}>No images in this category yet.</span>
              ) : activeItems.map(opt => (
                <AssetTile
                  key={opt.key}
                  src={opt.src}
                  label={opt.label}
                  selected={value === opt.src}
                  fit={activeFit}
                  onClick={() => { onChange(opt.src); setOpen(false) }}
                />
              ))}
            </div>

            {/* Footer: upload your own */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', padding: '0.8rem 1.1rem', borderTop: '1px solid rgb(var(--gold-rgb) / 0.2)' }}>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={busy}
                style={{ ...selectStyle, cursor: busy ? 'wait' : 'pointer', color: 'var(--lemon)', opacity: busy ? 0.5 : 1 }}
              >
                {busy ? 'Uploading…' : '＋ Upload your own'}
              </button>
              {err && <span style={{ fontSize: '0.7rem', color: 'var(--danger)' }}>{err}</span>}
            </div>
          </div>
        </div>
      )}

      <input ref={inputRef} type="file" accept="image/png,image/webp,image/svg+xml,image/jpeg,image/gif" style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) upload(f) }} />
    </div>
  )
}
