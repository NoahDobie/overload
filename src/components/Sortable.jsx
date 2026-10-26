import { useLayoutEffect, useRef, useState } from 'react'
import { Icon } from './ui.jsx'

// Drag-to-reorder for a vertical list, by a handle. Pointer events cover touch and mouse; the
// list reorders live as the dragged item's centre passes its neighbours, and the page scrolls
// when the finger nears the top or bottom edge. Arrow keys on a focused handle also move it.

const EDGE = 90, SPEED = 14

export function SortableList({ items, getKey, onMove, onDragChange, className = '', itemClassName = '', as: Tag = 'ul', children }) {
  const refs = useRef(new Map())
  const live = useRef({ items, onMove })
  live.current = { items, onMove }
  const st = useRef(null)
  const [dragKey, setDragKey] = useState(null)

  const place = () => {
    const s = st.current
    const el = s?.key && refs.current.get(s.key)
    if (!el) return
    const natural = el.getBoundingClientRect().top - s.ty
    s.ty = s.y - s.grab - natural
    el.style.transform = `translateY(${s.ty}px)`
  }

  const reorder = () => {
    const s = st.current
    if (!s?.key) return
    const keys = live.current.items.map(getKey)
    const from = keys.indexOf(s.key)
    const el = refs.current.get(s.key)
    const centre = s.y - s.grab + el.offsetHeight / 2
    let to = 0
    for (const k of keys) {
      if (k === s.key) continue
      const r = refs.current.get(k)?.getBoundingClientRect()
      if (r && r.top + r.height / 2 < centre) to++
    }
    if (to !== from) live.current.onMove(from, to)
    else place()
  }

  // After a reorder re-renders the list, keep the dragged item under the finger.
  useLayoutEffect(() => { if (st.current) place() }, [items])

  const tick = () => {
    const s = st.current
    if (!s) return
    const dy = s.y < EDGE ? -SPEED : s.y > window.innerHeight - EDGE ? SPEED : 0
    if (dy) { window.scrollBy(0, dy); reorder() }
    s.raf = requestAnimationFrame(tick)
  }

  const end = () => {
    const s = st.current
    if (!s) return
    cancelAnimationFrame(s.raf)
    const el = refs.current.get(s.key)
    if (el) el.style.transform = ''
    st.current = null
    setDragKey(null)
    onDragChange?.(false)
  }

  const handleProps = (key, label) => ({
    className: 'drag-handle',
    'aria-label': `Reorder ${label}. Drag, or use the arrow keys.`,
    onPointerDown: e => {
      if (e.button > 0) return
      e.preventDefault()
      e.currentTarget.setPointerCapture(e.pointerId)
      st.current = { pending: true }
      onDragChange?.(true)
      // Measure after a collapse triggered by onDragChange has rendered.
      requestAnimationFrame(() => {
        const el = refs.current.get(key)
        if (!st.current?.pending || !el) return
        const r = el.getBoundingClientRect()
        st.current = { key, grab: Math.min(Math.max(e.clientY - r.top, 0), r.height), y: e.clientY, ty: 0, raf: 0 }
        setDragKey(key)
        place()
        st.current.raf = requestAnimationFrame(tick)
      })
    },
    onPointerMove: e => { if (st.current?.key) { st.current.y = e.clientY; reorder() } },
    onPointerUp: end,
    onPointerCancel: end,
    onKeyDown: e => {
      const keys = live.current.items.map(getKey)
      const i = keys.indexOf(key)
      const to = e.key === 'ArrowUp' ? i - 1 : e.key === 'ArrowDown' ? i + 1 : -1
      if (to < 0 || to >= keys.length) return
      e.preventDefault()
      live.current.onMove(i, to)
      const target = e.currentTarget
      requestAnimationFrame(() => target.focus())
    }
  })

  const Item = Tag === 'ul' ? 'li' : 'div'
  return (
    <Tag className={'sortable ' + className}>
      {items.map((item, i) => {
        const key = getKey(item)
        return (
          <Item
            key={key}
            ref={el => { if (el) refs.current.set(key, el); else refs.current.delete(key) }}
            className={itemClassName + (dragKey === key ? ' dragging' : '')}>
            {children(item, i, handleProps, dragKey !== null)}
          </Item>
        )
      })}
    </Tag>
  )
}

export function DragHandle(props) {
  return <button type="button" {...props}><Icon name="grip" size={18} stroke={3} /></button>
}

/** Move one element of an array from index `from` to index `to`. */
export const moveItem = (arr, from, to) => {
  const out = [...arr]
  const [x] = out.splice(from, 1)
  out.splice(to, 0, x)
  return out
}
