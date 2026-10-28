import { useLayoutEffect, useRef, useState } from 'react'
import { Icon } from './ui.jsx'

// Drag-to-reorder for a vertical list, by a handle. Pointer events cover touch and mouse; the
// list reorders live as the dragged item's centre passes its neighbours, and the page scrolls
// when the finger nears the top or bottom edge. Arrow keys on a focused handle also move it.

const EDGE = 90, SPEED = 16

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

  // Reads every rect before writing the transform, so each frame costs at most one layout.
  const reorder = () => {
    const s = st.current
    const el = s?.key && refs.current.get(s.key)
    if (!el || s.moving) return
    const keys = live.current.items.map(getKey)
    const from = keys.indexOf(s.key)
    const r = el.getBoundingClientRect()
    const centre = s.y - s.grab + r.height / 2
    let to = 0
    for (const k of keys) {
      if (k === s.key) continue
      const o = refs.current.get(k)?.getBoundingClientRect()
      if (o && o.top + o.height / 2 < centre) to++
    }
    if (to !== from) {
      // Wait for the re-render before measuring again, or stale rects repeat the move.
      s.moving = true
      live.current.onMove(from, to)
      return
    }
    s.ty = s.y - s.grab - (r.top - s.ty)
    el.style.transform = `translateY(${s.ty}px)`
  }

  // After a reorder re-renders the list, keep the dragged item under the finger.
  useLayoutEffect(() => { if (st.current) { st.current.moving = false; place() } }, [items])

  // Pointer moves only record the position; the work happens here, once per frame.
  const tick = () => {
    const s = st.current
    if (!s) return
    // Faster the closer the finger gets to the edge, so a slot near the edge is easy to hit.
    const depth = s.y < EDGE ? s.y - EDGE : s.y > window.innerHeight - EDGE ? s.y - window.innerHeight + EDGE : 0
    const dy = Math.round(SPEED * Math.max(-1, Math.min(1, depth / EDGE)) ** 3)
    if (dy) { window.scrollBy(0, dy); s.dirty = true }
    if (s.dirty) { s.dirty = false; reorder() }
    s.raf = requestAnimationFrame(tick)
  }

  // Scroll so that `el` sits at viewport `top` again after the list changes height (a collapse
  // on drag start, or the expand on drop), so nothing jumps away from the finger.
  const hold = (el, top) => {
    const by = el.getBoundingClientRect().top - top
    if (by) window.scrollBy(0, by)
  }
  const root = document.documentElement

  const end = () => {
    const s = st.current
    if (!s) return
    cancelAnimationFrame(s.raf)
    st.current = null
    const el = refs.current.get(s.key)
    if (el) el.style.transform = ''
    const top = el?.getBoundingClientRect().top
    setDragKey(null)
    onDragChange?.(false)
    requestAnimationFrame(() => {
      if (el?.isConnected && top != null) hold(el, top)
      root.style.minHeight = ''
      root.style.overflowAnchor = ''
    })
  }

  const handleProps = (key, label) => ({
    className: 'drag-handle',
    'aria-label': `Reorder ${label}. Drag, or use the arrow keys.`,
    onPointerDown: e => {
      if (e.button > 0) return
      e.preventDefault()
      e.currentTarget.setPointerCapture(e.pointerId)
      st.current = { pending: true }
      const top = refs.current.get(key)?.getBoundingClientRect().top
      // Keep the page as tall as it is now, so a collapse can't clamp the scroll, and turn off
      // the browser's scroll anchoring, which would fight the scrolling done here.
      root.style.minHeight = root.scrollHeight + 'px'
      root.style.overflowAnchor = 'none'
      onDragChange?.(true)
      // Measure after a collapse triggered by onDragChange has rendered.
      requestAnimationFrame(() => {
        const el = refs.current.get(key)
        if (!st.current?.pending || !el) return
        if (top != null) hold(el, top)
        const r = el.getBoundingClientRect()
        st.current = { key, grab: e.clientY - r.top, y: e.clientY, ty: 0, raf: 0 }
        setDragKey(key)
        place()
        st.current.raf = requestAnimationFrame(tick)
      })
    },
    onPointerMove: e => { if (st.current?.key) { st.current.y = e.clientY; st.current.dirty = true } },
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
