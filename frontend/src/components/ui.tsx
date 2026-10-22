import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Clock, ImageOff, X, CircleHelp, CircleCheck, CircleAlert, History } from 'lucide-react'
import type { Fresh, OpenStatus } from '../lib/api'
import { cx, faNum } from '../lib/format'

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** Staggered entrance delay for list item `i` (capped so long lists don't lag). */
export const stagger = (i: number, step = 45): CSSProperties => ({ animationDelay: `${Math.min(i, 10) * step}ms` })

export function Chip({ active, onClick, children, icon, className }: {
  active?: boolean; onClick?: () => void; children: ReactNode; icon?: ReactNode; className?: string
}) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      className={cx('inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors duration-150 active:scale-95',
        active ? 'animate-pop border-brand-700 bg-brand-700 text-white' : 'border-line bg-white text-ink-2 hover:border-brand-500 hover:text-brand-800',
        className)}>
      {icon}{children}
    </button>
  )
}

type Tone = 'green' | 'brand' | 'amber' | 'red' | 'gray' | 'blue' | 'orange'
const TONES: Record<Tone, string> = {
  green: 'bg-ok-50 text-ok-800 ring-ok-200',
  brand: 'bg-brand-50 text-brand-800 ring-brand-200',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200',
  red: 'bg-red-50 text-red-700 ring-red-200',
  gray: 'bg-slate-100 text-ink-2 ring-slate-200',
  blue: 'bg-accent-50 text-accent-700 ring-accent-200',
  orange: 'bg-orange-50 text-orange-700 ring-orange-200',
}

export function Badge({ tone = 'gray', children, icon, className }: { tone?: Tone; children: ReactNode; icon?: ReactNode; className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset', TONES[tone], className)}>
      {icon}{children}
    </span>
  )
}

export function OpenBadge({ open, short }: { open: OpenStatus; short?: boolean }) {
  const tone: Tone = open.state === 'open' ? (open.closing_soon ? 'amber' : 'green') : open.state === 'closed' ? 'red' : 'gray'
  const text = !short ? open.label
    : open.state === 'open' ? (open.closes_at ? `باز تا ${open.closes_at}` : 'باز')
      : open.state === 'closed' ? 'بسته' : 'ساعت نامشخص'
  return (
    <Badge tone={tone} icon={open.state === 'open'
      ? <span className="relative flex size-2" aria-hidden><span className="absolute inline-flex size-full animate-ping rounded-full bg-ok-500 opacity-60" /><span className="relative inline-flex size-2 rounded-full bg-ok-600" /></span>
      : <Clock size={12} aria-hidden />}>
      <span>{text}</span>
    </Badge>
  )
}

export function FreshBadge({ f }: { f: Fresh }) {
  const tone: Tone = f.level === 'fresh' ? 'green' : f.level === 'recent' ? 'blue' : f.level === 'unknown' ? 'gray' : 'amber'
  return <Badge tone={tone} icon={<History size={12} aria-hidden />}>قیمت {f.label}</Badge>
}

/** A listing is not stock. Only a seller reply confirms availability. */
export function StockNote({ kind }: { kind: 'unverified' | 'confirmed' | 'category_only' | 'no' }) {
  if (kind === 'confirmed') return <Badge tone="green" icon={<CircleCheck size={12} />}>موجودی تأییدشده توسط فروشنده</Badge>
  if (kind === 'no') return <Badge tone="red" icon={<CircleAlert size={12} />}>فروشنده: ناموجود</Badge>
  if (kind === 'category_only') return <Badge tone="gray" icon={<CircleHelp size={12} />}>فقط در این دسته فعالیت دارد</Badge>
  return <Badge tone="gray" icon={<CircleHelp size={12} />}>موجودی تأیید نشده</Badge>
}

export function Img({ src, alt, className }: { src: string | null | undefined; alt: string; className?: string }) {
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading')
  if (!src || state === 'error')
    return <div className={cx('grid place-items-center bg-slate-100 text-slate-400', className)}><ImageOff size={22} aria-hidden /></div>
  return (
    <img src={src} alt={alt} loading="lazy" decoding="async" onLoad={() => setState('ok')} onError={() => setState('error')}
      className={cx('bg-white object-contain transition-[opacity,filter] duration-500', state === 'loading' ? 'opacity-0 blur-sm' : 'opacity-100 blur-0', className)} />
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('skeleton rounded-xl', className)} aria-hidden />
}

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; hint?: ReactNode }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3">
      <span className="flex flex-col"><span className="text-sm font-medium">{label}</span>{hint && <span className="text-xs text-ink-3">{hint}</span>}</span>
      <span className="relative inline-flex shrink-0">
        <input type="checkbox" className="peer sr-only" checked={checked} onChange={e => onChange(e.target.checked)} />
        <span className="h-6 w-11 rounded-full bg-slate-300 transition-colors duration-200 peer-checked:bg-brand-600 peer-focus-visible:ring-2 peer-focus-visible:ring-accent-500 peer-focus-visible:ring-offset-2" />
        <span className="absolute top-0.5 right-0.5 size-5 rounded-full bg-white shadow transition-transform duration-300 ease-[var(--ease-spring)] peer-checked:-translate-x-5" />
      </span>
    </label>
  )
}

const SHEET_EXIT_MS = 200

export function Sheet({ open, onClose, title, children, footer }: {
  open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode
}) {
  // Stay mounted for the exit animation after `open` turns false.
  const [mounted, setMounted] = useState(open)
  const [closing, setClosing] = useState(false)
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) {
      setMounted(true)
      setClosing(false)
      return
    }
    if (!mounted) return
    setClosing(true)
    const t = window.setTimeout(() => { setMounted(false); setClosing(false) }, SHEET_EXIT_MS)
    return () => clearTimeout(t)
  }, [open, mounted])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    const prev = document.activeElement as HTMLElement | null
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    panel.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
      prev?.focus?.()
    }
  }, [open, onClose])

  if (!mounted) return null
  return (
    <div className="fixed inset-0 z-[1000] flex items-end justify-center" role="dialog" aria-modal="true"
      aria-label={typeof title === 'string' ? title : undefined}>
      <div className={cx('absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]', closing ? 'animate-fade-out' : 'animate-fade-in')} onClick={onClose} />
      <div ref={panel} tabIndex={-1}
        className={cx('relative flex max-h-[88dvh] w-full max-w-lg flex-col rounded-t-3xl bg-white shadow-float outline-none', closing ? 'animate-sheet-out' : 'animate-sheet')}>
        <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-slate-200" />
        <div className="flex items-center justify-between px-5 pt-2 pb-3">
          <h2 className="text-base font-bold">{title}</h2>
          <button onClick={onClose} aria-label="بستن" className="grid size-10 place-items-center rounded-full transition-colors hover:bg-slate-100"><X size={20} /></button>
        </div>
        <div className="overflow-y-auto overscroll-contain px-5 pb-4">{children}</div>
        {footer && <div className="border-t border-line px-5 py-3 pb-safe">{footer}</div>}
      </div>
    </div>
  )
}

export function Btn({ children, onClick, variant = 'primary', className, disabled, type = 'button', icon, loading }: {
  children: ReactNode; onClick?: () => void; variant?: 'primary' | 'accent' | 'ghost' | 'outline'; className?: string
  disabled?: boolean; type?: 'button' | 'submit'; icon?: ReactNode; loading?: boolean
}) {
  const v = {
    primary: 'bg-brand-600 text-white shadow-sm shadow-brand-600/20 hover:bg-brand-700 hover:shadow-md hover:shadow-brand-600/25 disabled:bg-slate-300 disabled:shadow-none',
    accent: 'bg-accent-600 text-white hover:bg-accent-700 disabled:bg-slate-300',
    ghost: 'text-brand-700 hover:bg-brand-50',
    outline: 'border border-line bg-white text-ink hover:border-brand-500',
  }[variant]
  return (
    <button type={type} onClick={onClick} disabled={disabled || loading} aria-busy={loading}
      className={cx('inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold transition-all duration-150 active:scale-[0.97] disabled:cursor-not-allowed', v, className)}>
      {loading ? <Spinner /> : icon}{children}
    </button>
  )
}

export const Spinner = ({ className }: { className?: string }) => (
  <span className={cx('inline-block size-4 animate-spin rounded-full border-2 border-current border-e-transparent', className)} aria-hidden />
)

export function TypingDots({ className }: { className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-1', className)} aria-hidden>
      {[0, 1, 2].map(i => <span key={i} className="size-1.5 animate-dot rounded-full bg-current" style={{ animationDelay: `${i * 0.15}s` }} />)}
    </span>
  )
}

/** Counts up from 0 once it scrolls into view (Persian digits). */
export function CountUp({ to, duration = 1200 }: { to: number; duration?: number }) {
  const [v, setV] = useState(prefersReducedMotion() ? to : 0)
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (prefersReducedMotion() || !ref.current) return
    let raf = 0
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return
      io.disconnect()
      const t0 = performance.now()
      const step = (t: number) => {
        const p = Math.min(1, (t - t0) / duration)
        setV(Math.round(to * (1 - Math.pow(1 - p, 3))))
        if (p < 1) raf = requestAnimationFrame(step)
      }
      raf = requestAnimationFrame(step)
    })
    io.observe(ref.current)
    return () => { io.disconnect(); cancelAnimationFrame(raf) }
  }, [to, duration])
  return <span ref={ref} className="tabular-nums">{faNum(v)}</span>
}

/** Cycles through phrases with a typing effect, e.g. for a placeholder. */
export function useTypewriter(phrases: string[], active = true) {
  const [text, setText] = useState(phrases[0] ?? '')
  useEffect(() => {
    if (!active || prefersReducedMotion() || phrases.length < 2) return
    let i = 0, n = 0, deleting = false, t = 0
    const tick = () => {
      const full = phrases[i]
      n += deleting ? -1 : 1
      setText(full.slice(0, n))
      let wait = deleting ? 22 : 55
      if (!deleting && n >= full.length) { deleting = true; wait = 1800 }
      else if (deleting && n <= 0) { deleting = false; i = (i + 1) % phrases.length; wait = 300 }
      t = window.setTimeout(tick, wait)
    }
    t = window.setTimeout(tick, 1200)
    return () => clearTimeout(t)
  }, [phrases, active])
  return text
}

export function Empty({ icon, title, text, action }: { icon: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex animate-fade-up flex-col items-center gap-2 px-6 py-12 text-center">
      <div className="grid size-14 place-items-center rounded-2xl bg-brand-50 text-brand-600">{icon}</div>
      <p className="mt-1 font-bold">{title}</p>
      {text && <p className="max-w-xs text-sm text-ink-3">{text}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

export function Card({ children, className, style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return <div className={cx('rounded-2xl bg-white p-4 shadow-card', className)} style={style}>{children}</div>
}
