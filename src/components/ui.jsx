import { useEffect } from 'react'

const PATHS = {
  today: 'M4 5h16v15H4zM4 9h16M9 3v4M15 3v4',
  history: 'M4 4h4v4H4zM10 4h4v4h-4zM16 4h4v4h-4zM4 10h4v4H4zM10 10h4v4h-4zM16 10h4v4h-4zM4 16h4v4H4zM10 16h4v4h-4z',
  body: 'M12 3a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM6 10h12M12 10v5M9 21l3-6 3 6',
  settings: 'M4 7h10M18 7h2M4 17h4M12 17h8M14 5v4M8 15v4',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  close: 'M6 6l12 12M18 6L6 18',
  back: 'M15 5l-7 7 7 7',
  run: 'M13 4a1.6 1.6 0 1 0 0 .1M9 20l2.5-5 3 2V21M7 11l3-3 3 1.5 2 3 3 .5M11.5 15L10 10',
  trash: 'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13',
  chev: 'M9 6l6 6-6 6',
  up: 'M6 15l6-6 6 6',
  down: 'M6 9l6 6 6-6',
  copy: 'M9 9h10v10H9zM5 15V5h10',
  search: 'M11 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14zM20 20l-4-4',
  grip: 'M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01'
}

export function Icon({ name, size = 22, stroke = 2 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  )
}

/** Bottom sheet. Tap the backdrop or press Escape to close. */
export function Sheet({ open, onClose, title, children }) {
  useEffect(() => {
    if (!open) return
    const k = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={e => e.stopPropagation()}>
        <div className="sheet-grab" />
        {title && <h2 className="sheet-title">{title}</h2>}
        {children}
      </div>
    </div>
  )
}

export function Segmented({ value, onChange, options }) {
  return (
    <div className="seg" role="radiogroup">
      {options.map(o => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value}
          className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  )
}

/** Numeric input with − / + buttons. */
export function Stepper({ value, onChange, step = 1, min = 0, label, width = 64 }) {
  const n = Number(value) || 0
  const set = v => onChange(Math.max(min, Math.round(v * 100) / 100))
  return (
    <div className="stp">
      <button type="button" aria-label={`Less ${label}`} onClick={() => set(n - step)}><Icon name="minus" size={16} /></button>
      <input inputMode="decimal" aria-label={label} style={{ width }} value={value}
        onChange={e => onChange(e.target.value.replace(/[^0-9.]/g, ''))}
        onBlur={e => set(Number(e.target.value) || 0)} />
      <button type="button" aria-label={`More ${label}`} onClick={() => set(n + step)}><Icon name="plus" size={16} /></button>
    </div>
  )
}
