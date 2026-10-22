import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Bot, Check, CreditCard, Lightbulb, Search, SlidersHorizontal, Wallet, Radar, Scale, PackageSearch, Sparkles } from 'lucide-react'
import { AppBar, Page } from '../components/Layout'
import { ProductCard } from '../components/Cards'
import { Btn, Chip, Empty, Sheet, Skeleton, Toggle, TypingDots, stagger } from '../components/ui'
import { api, type Intent, type Reco, type SearchResp } from '../lib/api'
import { useStore } from '../lib/store'
import { cx, faNum, tomanShort } from '../lib/format'

const BUDGETS = [1, 3, 5, 10, 20, 50]
const RADII = [1, 3, 5, 10]

export default function Results() {
  const [sp, setSp] = useSearchParams()
  const nav = useNavigate()
  const { loc, filters, setFilters, compare } = useStore()
  const q = sp.get('q') || ''
  const bmaxParam = sp.get('bmax'), bminParam = sp.get('bmin')
  const category = sp.get('cat') || undefined
  const brand = sp.get('brand') || undefined

  const [intent, setIntent] = useState<Intent | null>(null)
  const [thinking, setThinking] = useState(true)
  const [res, setRes] = useState<SearchResp | null>(null)
  const [loading, setLoading] = useState(true)
  const [reco, setReco] = useState<Reco | null>(null)
  const [err, setErr] = useState('')
  const [sheet, setSheet] = useState<null | 'budget' | 'filters'>(null)
  const [draft, setDraft] = useState(q)
  useEffect(() => { setDraft(q) }, [q])

  // 1) understand: instant rules, then LLM refinement
  useEffect(() => {
    if (!q) return
    let alive = true
    setIntent(null); setReco(null); setThinking(true); setErr('')
    api.understand(q, true).then(i => alive && setIntent(prev => prev ?? i)).catch(() => {})
    api.understand(q).then(i => { if (alive) { setIntent(i); setThinking(false) } }).catch(() => alive && setThinking(false))
    return () => { alive = false }
  }, [q])

  const bmax = bmaxParam != null ? (bmaxParam === '0' ? null : +bmaxParam) : intent?.budget_max ?? null
  const bmin = bminParam != null ? (bminParam === '0' ? null : +bminParam) : intent?.budget_min ?? null
  const keywords = intent?.keywords
  const alt = intent?.alt_keywords?.join('|') || ''

  // 2) search whenever the understood need or filters change
  useEffect(() => {
    if (!keywords) return
    let alive = true
    setLoading(true)
    api.search({ q: keywords, alt: alt ? alt.split('|') : [], budget_max: bmax, budget_min: bmin, category, brand,
      lat: loc.lat, lon: loc.lon, radius_km: filters.radiusKm, installment: filters.installment })
      .then(r => { if (alive) { setRes(r); setLoading(false) } }, e => { if (alive) { setErr(e.message); setLoading(false) } })
    return () => { alive = false }
  }, [keywords, alt, bmax, bmin, category, brand, loc.lat, loc.lon, filters.radiusKm, filters.installment])

  // 3) model recommendation once the LLM has understood the need
  useEffect(() => {
    if (!res?.items.length || thinking || intent?.source !== 'llm') return
    let alive = true
    const need = [q, intent.use_case, ...(intent.must_have || [])].filter(Boolean).join('، ')
    api.recommend(need, res.items.slice(0, 8).map(p => p.product_id), loc.lat, loc.lon).then(r => alive && setReco(r)).catch(() => {})
    return () => { alive = false }
  }, [res, thinking, intent, q, loc.lat, loc.lon])

  const pickMap = useMemo(() => new Map((reco?.picks || []).map(p => [p.product_id, p.reason])), [reco])
  const items = useMemo(() => {
    if (!res) return []
    const picked = res.items.filter(p => pickMap.has(p.product_id))
    return [...picked, ...res.items.filter(p => !pickMap.has(p.product_id))]
  }, [res, pickMap])

  const setParam = (k: string, v: string | null) => {
    const n = new URLSearchParams(sp)
    if (v == null) n.delete(k); else n.set(k, v)
    setSp(n, { replace: true })
  }
  const refine = (extra: string) => nav(`/s?q=${encodeURIComponent(`${q}، ${extra}`)}`)
  const submit = (e: FormEvent) => { e.preventDefault(); if (draft.trim()) nav(`/s?q=${encodeURIComponent(draft.trim())}`) }
  const activeFilters = +filters.installment + +!!filters.radiusKm

  return (
    <>
      <AppBar back title={
        <form onSubmit={submit} className="flex items-center gap-2 rounded-xl bg-slate-100 px-3">
          <Search size={16} className="shrink-0 text-ink-3" aria-hidden />
          <input value={draft} onChange={e => setDraft(e.target.value)} aria-label="جستجو" className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none" />
        </form>
      } right={<span />}>
        <div className="no-scrollbar mx-auto flex max-w-3xl gap-2 overflow-x-auto px-3 pb-2.5">
          <Chip active={!!bmax || !!bmin} onClick={() => setSheet('budget')} icon={<Wallet size={15} />}>
            {bmax ? `تا ${tomanShort(bmax)}` : bmin ? `از ${tomanShort(bmin)}` : 'بودجه'}
          </Chip>
          <Chip active={filters.installment} onClick={() => setFilters({ installment: !filters.installment })} icon={<CreditCard size={15} />}>قسطی</Chip>
          <Chip active={!!filters.radiusKm} onClick={() => setSheet('filters')} icon={<Radar size={15} />}>
            {filters.radiusKm ? `تا ${faNum(filters.radiusKm)} کیلومتر` : 'محدوده'}
          </Chip>
          <Chip onClick={() => setSheet('filters')} icon={<SlidersHorizontal size={15} />}>فیلترها{activeFilters ? ` (${faNum(activeFilters)})` : ''}</Chip>
        </div>
      </AppBar>

      <Page className="!pt-3">
        {/* Assistant understanding */}
        <section className="rounded-2xl bg-gradient-to-bl from-accent-50 to-white p-4 ring-1 ring-accent-100" aria-live="polite">
          <div className="flex items-center gap-2 text-sm font-bold text-accent-700">
            <span className="relative grid size-8 place-items-center rounded-full bg-accent-600 text-white">
              <Bot size={17} className={cx(thinking && 'animate-[wiggle_1s_ease-in-out_infinite]')} />
              {thinking && <span className="absolute inset-0 animate-ping rounded-full bg-accent-500/40" aria-hidden />}
            </span>
            دستیار خرید
            {thinking && <span className="flex items-center gap-1.5 text-xs font-medium text-ink-3"><TypingDots className="text-accent-600" />در حال فهمیدن نیازت</span>}
            {!thinking && intent?.source === 'llm' && <span className="animate-pop rounded-full bg-accent-100 px-2 py-0.5 text-[11px] text-accent-700"><Sparkles size={11} className="inline" /> هوشمند</span>}
          </div>
          {intent?.understood ? <p key={intent.understood} className="mt-2 animate-reveal text-sm leading-7">{intent.understood}</p>
            : <p className="mt-2 text-sm text-ink-2">«{q}»</p>}
          {(intent?.use_case || intent?.must_have?.length) ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {intent.use_case && <span className="animate-fade-up rounded-full bg-white px-2.5 py-1 text-xs ring-1 ring-accent-200">کاربرد: {intent.use_case}</span>}
              {intent.must_have.map((m, i) => (
                <span key={m} style={stagger(i + 1, 70)} className="flex animate-fade-up items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs ring-1 ring-line">
                  <Check size={12} className="text-ok-600" />{m}
                </span>
              ))}
            </div>
          ) : null}
          {intent?.advice && (
            <p className="mt-3 flex animate-reveal gap-2 rounded-xl bg-white/80 p-3 text-xs leading-6 text-ink-2 ring-1 ring-line [animation-delay:200ms]">
              <Lightbulb size={16} className="mt-0.5 shrink-0 text-amber-500" aria-hidden />{intent.advice}
            </p>
          )}
          {intent?.questions?.map((qq, qi) => (
            <div key={qq.q} className="mt-3 animate-fade-up" style={stagger(qi + 4, 80)}>
              <p className="mb-1.5 text-sm font-medium">{qq.q}</p>
              <div className="flex flex-wrap gap-1.5">{qq.options.map(o => <Chip key={o} onClick={() => refine(`${qq.q.replace(/[؟?]/g, '')}: ${o}`)}>{o}</Chip>)}</div>
            </div>
          ))}
          {reco?.tip && <p className="mt-3 animate-reveal text-xs leading-6 text-accent-700">💡 {reco.tip}</p>}
        </section>

        {/* Category facets */}
        {res && res.facets.categories.length > 1 && (
          <div className="no-scrollbar -mx-4 mt-4 flex gap-2 overflow-x-auto px-4">
            <Chip active={!category} onClick={() => setParam('cat', null)}>همه دسته‌ها</Chip>
            {res.facets.categories.map(c => (
              <Chip key={c.name} active={category === c.name} onClick={() => setParam('cat', category === c.name ? null : c.name)}>
                {c.name} <span className="text-xs opacity-70">{faNum(c.count)}</span>
              </Chip>
            ))}
          </div>
        )}

        <div className="mt-4 mb-2 flex items-center justify-between">
          <h2 className="text-sm font-bold text-ink-2">
            {loading ? 'در حال جستجو…' : res ? `${faNum(res.total)} کالا پیدا شد` : ''}
            {filters.installment && !loading && <span className="text-orange-700"> · فقط قسطی</span>}
          </h2>
          {res && res.facets.brands.length > 1 && (
            <select value={brand || ''} onChange={e => setParam('brand', e.target.value || null)} aria-label="برند"
              className="h-9 rounded-lg border border-line bg-white px-2 text-sm">
              <option value="">همه برندها</option>
              {res.facets.brands.map(b => <option key={b.name} value={b.name}>{b.name}</option>)}
            </select>
          )}
        </div>

        {err && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{err}</p>}
        {loading && !res && <div className="space-y-3">{[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-32" />)}</div>}
        {loading && res && <div className="mb-2 h-1 overflow-hidden rounded-full bg-brand-100"><div className="progress-stripes h-full w-full bg-brand-500" /></div>}
        {!loading && res && !items.length && (
          <Empty icon={<PackageSearch size={26} />} title="کالایی با این شرایط پیدا نشد"
            text={filters.installment ? 'فقط ۲۶۶ فروشگاه خرید اقساطی اعلام کرده‌اند؛ فیلتر قسطی یا بودجه را بردار.' : 'بودجه یا دسته را تغییر بده یا عبارت ساده‌تری بنویس.'}
            action={<div className="flex gap-2">
              {filters.installment && <Btn variant="outline" onClick={() => setFilters({ installment: false })}>حذف فیلتر قسطی</Btn>}
              {(bmax || bmin) && <Btn variant="outline" onClick={() => { setParam('bmax', '0'); setParam('bmin', '0') }}>حذف بودجه</Btn>}
            </div>} />
        )}
        <div className={cx('space-y-3 transition-opacity', loading && res && 'opacity-50')}>
          {items.map((p, i) => <ProductCard key={p.product_id} p={p} pick={pickMap.get(p.product_id)} index={i} />)}
        </div>
      </Page>

      {compare.length >= 2 && (
        <div className="fixed inset-x-0 bottom-16 z-[550] animate-[toast-in_0.35s_var(--ease-spring)_both] px-4 pb-safe">
          <Btn variant="accent" className="mx-auto flex w-full max-w-md shadow-float" icon={<Scale size={18} />} onClick={() => nav('/compare')}>
            مقایسه {faNum(compare.length)} کالا
          </Btn>
        </div>
      )}

      <Sheet open={sheet === 'budget'} onClose={() => setSheet(null)} title="بودجه‌ات چقدر است؟">
        <BudgetForm bmin={bmin} bmax={bmax} onApply={(mn, mx) => {
          const n = new URLSearchParams(sp)
          n.set('bmin', String(mn ?? 0)); n.set('bmax', String(mx ?? 0))
          setSp(n, { replace: true }); setSheet(null)
        }} />
      </Sheet>

      <Sheet open={sheet === 'filters'} onClose={() => setSheet(null)} title="شرایط خرید"
        footer={<Btn className="w-full" onClick={() => setSheet(null)}>نمایش نتایج</Btn>}>
        <Toggle checked={filters.installment} onChange={v => setFilters({ installment: v })} label="فقط خرید اقساطی" hint="فروشگاه‌هایی که سرویس اقساطی اعلام کرده‌اند" />
        <hr className="my-3 border-line" />
        <p className="mb-2 text-sm font-medium">حداکثر فاصله از {loc.label}</p>
        <div className="flex flex-wrap gap-2">
          <Chip active={!filters.radiusKm} onClick={() => setFilters({ radiusKm: null })}>همه تهران</Chip>
          {RADII.map(r => <Chip key={r} active={filters.radiusKm === r} onClick={() => setFilters({ radiusKm: r })}>{faNum(r)} کیلومتر</Chip>)}
        </div>
      </Sheet>
    </>
  )
}

function BudgetForm({ bmin, bmax, onApply }: { bmin: number | null; bmax: number | null; onApply: (mn: number | null, mx: number | null) => void }) {
  const [mn, setMn] = useState(bmin ? String(bmin / 1e6) : '')
  const [mx, setMx] = useState(bmax ? String(bmax / 1e6) : '')
  const toNum = (s: string) => {
    const v = parseFloat(s.replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))))
    return v > 0 ? Math.round(v * 1e6) : null
  }
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {BUDGETS.map(b => <Chip key={b} active={bmax === b * 1e6 && !bmin} onClick={() => onApply(null, b * 1e6)}>تا {faNum(b)} میلیون</Chip>)}
        <Chip active={!bmax && !bmin} onClick={() => onApply(null, null)}>بدون محدودیت</Chip>
      </div>
      <p className="mt-5 mb-2 text-sm font-medium">یا بازه دلخواه (میلیون تومان)</p>
      <div className="flex items-center gap-2">
        <label className="flex-1"><span className="sr-only">از</span>
          <input inputMode="decimal" value={mn} onChange={e => setMn(e.target.value)} placeholder="از" className="h-11 w-full rounded-xl border border-line px-3" /></label>
        <span className="text-ink-3">تا</span>
        <label className="flex-1"><span className="sr-only">تا</span>
          <input inputMode="decimal" value={mx} onChange={e => setMx(e.target.value)} placeholder="تا" className="h-11 w-full rounded-xl border border-line px-3" /></label>
      </div>
      <Btn className="mt-4 w-full" onClick={() => onApply(toNum(mn), toNum(mx))}>اعمال بودجه</Btn>
    </div>
  )
}
