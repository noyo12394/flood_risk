import { useRef, useState, type PointerEvent } from 'react'

// Makes a floating panel draggable by a handle. The handle element must be a
// direct child of the panel it moves. Disabled on narrow screens (the panels
// dock responsively there instead). Returns a style to spread on the panel and
// a pointer-down handler for the handle.
export function useDraggable(defaultPos?: { x: number; y: number }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(defaultPos ?? null)
  const offset = useRef({ x: 0, y: 0 })

  function onHandleDown(e: PointerEvent<HTMLElement>) {
    if (window.innerWidth <= 900) return
    const panel = e.currentTarget.parentElement
    if (!panel) return
    const rect = panel.getBoundingClientRect()
    offset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top }
    const width = rect.width
    const move = (ev: globalThis.PointerEvent) => {
      setPos({
        x: Math.max(8, Math.min(window.innerWidth - width - 8, ev.clientX - offset.current.x)),
        y: Math.max(72, Math.min(window.innerHeight - 60, ev.clientY - offset.current.y)),
      })
    }
    const stop = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
  }

  const style: React.CSSProperties | undefined = pos
    ? { left: pos.x, top: pos.y, right: 'auto', bottom: 'auto', transform: 'none' }
    : undefined

  return { style, onHandleDown }
}
