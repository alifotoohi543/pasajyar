import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { CircleCheck, CircleAlert, Info } from 'lucide-react'
import { cx } from './format'

type Kind = 'success' | 'error' | 'info'
type Toast = { id: number; text: string; kind: Kind; leaving?: boolean }
type Ctx = (text: string, kind?: Kind) => void

const ToastCtx = createContext<Ctx>(() => {})
const DURATION_MS = 2600
const EXIT_MS = 180

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([])
  const seq = useRef(0)

  const push = useCallback<Ctx>((text, kind = 'success') => {
    const id = ++seq.current
    setItems(xs => [...xs.slice(-2), { id, text, kind }])
    window.setTimeout(() => setItems(xs => xs.map(t => (t.id === id ? { ...t, leaving: true } : t))), DURATION_MS)
    window.setTimeout(() => setItems(xs => xs.filter(t => t.id !== id)), DURATION_MS + EXIT_MS)
  }, [])

  const value = useMemo(() => push, [push])
  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[1100] flex flex-col items-center gap-2 px-4" aria-live="polite" role="status">
        {items.map(t => (
          <div key={t.id}
            className={cx('flex max-w-sm items-center gap-2 rounded-2xl bg-ink px-4 py-2.5 text-sm font-medium text-white shadow-float',
              t.leaving ? 'animate-fade-out' : 'animate-toast-in')}>
            {t.kind === 'success' && <CircleCheck size={18} className="shrink-0 text-ok-500" aria-hidden />}
            {t.kind === 'error' && <CircleAlert size={18} className="shrink-0 text-brand-500" aria-hidden />}
            {t.kind === 'info' && <Info size={18} className="shrink-0 text-accent-500" aria-hidden />}
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

export const useToast = () => useContext(ToastCtx)
