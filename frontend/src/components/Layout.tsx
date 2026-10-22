import { useEffect, useState, type ReactNode } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { ArrowRight, ChevronDown, LocateFixed, MapPin, MessagesSquare, Search, Store, Scale } from 'lucide-react'
import { api, type Area, type Batch } from '../lib/api'
import { useStore } from '../lib/store'
import { cx, faNum } from '../lib/format'
import { useToast } from '../lib/toast'
import { Sheet, Btn, stagger } from './ui'

export function LocationChip() {
  const { loc, openLocSheet } = useStore()
  return (
    <button onClick={() => openLocSheet(true)} className="flex min-h-10 max-w-[60vw] items-center gap-1.5 rounded-full bg-brand-50 px-3 text-sm font-medium text-brand-800 ring-1 ring-brand-200 hover:bg-brand-100">
      <MapPin size={16} aria-hidden className="shrink-0" />
      <span className="truncate">{loc.label}</span>
      <ChevronDown size={14} aria-hidden className="shrink-0" />
    </button>
  )
}

function useScrolled(threshold = 4) {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > threshold)
    on()
    window.addEventListener('scroll', on, { passive: true })
    return () => window.removeEventListener('scroll', on)
  }, [threshold])
  return scrolled
}

export function AppBar({ title, back, right, children }: { title?: ReactNode; back?: boolean; right?: ReactNode; children?: ReactNode }) {
  const nav = useNavigate()
  const scrolled = useScrolled()
  return (
    <header className={cx('sticky top-0 z-[500] border-b bg-white/90 backdrop-blur transition-shadow duration-300',
      scrolled ? 'border-line shadow-[0_4px_20px_rgb(15_23_42/0.06)]' : 'border-line/70')}>
      <div className="mx-auto flex h-14 max-w-3xl items-center gap-2 px-3">
        {back ? (
          <button onClick={() => (history.length > 1 ? nav(-1) : nav('/'))} aria-label="بازگشت" className="group grid size-10 place-items-center rounded-full transition-colors hover:bg-slate-100"><ArrowRight size={22} className="transition-transform group-hover:translate-x-0.5" /></button>
        ) : (
          <Link to="/" className="group flex items-center gap-2 font-black text-brand-700">
            <img src="/favicon.svg" alt="" className="size-8 transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110" />
            <span className="text-lg">پاساژیار</span>
          </Link>
        )}
        {title && <h1 className="min-w-0 flex-1 truncate text-base font-bold">{title}</h1>}
        {!title && <div className="flex-1" />}
        {right ?? <LocationChip />}
      </div>
      {children}
    </header>
  )
}

export function BottomNav() {
  const { clientId, compare } = useStore()
  const [pending, setPending] = useState(0)
  useEffect(() => {
    const tick = () => api.inquiries(clientId)
      .then(bs => setPending(bs.reduce((a: number, b: Batch) => a + b.counts.available, 0)))
      .catch(() => { /* badge is best-effort */ })
    tick()
    const t = window.setInterval(tick, 8000)
    return () => clearInterval(t)
  }, [clientId])
  const item = (to: string, icon: ReactNode, label: string, badge?: number) => (
    <NavLink to={to} end={to === '/'} className={({ isActive }) => cx('group relative flex flex-1 flex-col items-center gap-0.5 py-2 text-xs font-medium transition-colors', isActive ? 'text-brand-600' : 'text-ink-3 hover:text-ink')}>
      {({ isActive }) => (
        <>
          <span className={cx('absolute top-0 h-0.5 rounded-full bg-brand-600 transition-all duration-300', isActive ? 'w-8 opacity-100' : 'w-0 opacity-0')} />
          <span className={cx('transition-transform duration-300', isActive ? '-translate-y-0.5 scale-110' : 'group-active:scale-90')}>{icon}</span>
          <span>{label}</span>
          {!!badge && <span key={badge} className="absolute top-1 left-1/2 min-w-5 -translate-x-4 animate-bump rounded-full bg-brand-600 px-1 text-center text-[11px] leading-5 text-white">{faNum(badge)}</span>}
        </>
      )}
    </NavLink>
  )
  return (
    <nav className="fixed inset-x-0 bottom-0 z-[600] border-t border-line bg-white/95 backdrop-blur pb-safe" aria-label="ناوبری اصلی">
      <div className="mx-auto flex max-w-3xl">
        {item('/', <Search size={22} />, 'جستجو')}
        {item('/compare', <Scale size={22} />, 'مقایسه', compare.length)}
        {item('/track', <MessagesSquare size={22} />, 'استعلام‌ها', pending)}
        {item('/seller', <Store size={22} />, 'پنل فروشنده')}
      </div>
    </nav>
  )
}

export function LocationSheet() {
  const { locSheet, openLocSheet, setLoc, locate, locating, loc } = useStore()
  const toast = useToast()
  const [areas, setAreas] = useState<Area[]>([])
  const [err, setErr] = useState('')
  useEffect(() => { if (locSheet && !areas.length) api.areas().then(setAreas).catch(() => {}) }, [locSheet, areas.length])
  return (
    <Sheet open={locSheet} onClose={() => openLocSheet(false)} title="کجا هستی؟">
      <p className="mb-3 text-sm text-ink-3">فاصله، زمان رسیدن و ترتیب فروشگاه‌ها بر اساس این موقعیت حساب می‌شود.</p>
      <Btn variant="primary" className="w-full" icon={<LocateFixed size={18} />} disabled={locating}
        onClick={() => locate().then(() => { openLocSheet(false); toast('موقعیت فعلی شما ثبت شد') }, e => setErr(e.message))}>
        {locating ? 'در حال پیدا کردن…' : 'استفاده از موقعیت فعلی من'}
      </Btn>
      {err && <p role="alert" className="mt-2 text-sm text-red-700">{err} — یکی از محله‌های زیر را انتخاب کن.</p>}
      <h3 className="mt-5 mb-2 text-sm font-bold text-ink-2">یا یکی از مراکز خرید پرفروشگاه:</h3>
      <div className="grid grid-cols-2 gap-2">
        {areas.map((a, i) => (
          <button key={a.name} onClick={() => { setLoc({ lat: a.lat, lon: a.lon, label: a.name, source: 'area' }); openLocSheet(false); toast(`موقعیت: ${a.name}`, 'info') }}
            style={stagger(i, 25)}
            className={cx('flex min-h-12 animate-fade-up items-center justify-between rounded-xl border px-3 text-start text-sm transition-colors',
              loc.label === a.name ? 'border-brand-600 bg-brand-50' : 'border-line hover:border-brand-500')}>
            <span className="font-medium">{a.name}</span>
            <span className="text-xs text-ink-3">{faNum(a.n)} فروشگاه</span>
          </button>
        ))}
      </div>
    </Sheet>
  )
}

export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return <main className={cx('mx-auto max-w-3xl px-4 pt-4 pb-28', className)}>{children}</main>
}
