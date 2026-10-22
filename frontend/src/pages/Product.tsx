import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Building2, ChevronDown, Info, ListChecks, Map as MapIcon, MessageCircleQuestion, Repeat, Scale, Store, Table2 } from 'lucide-react'
import { AppBar, Page } from '../components/Layout'
import { MiniShop, OfferCard, PriceBlock, ProductCard } from '../components/Cards'
import MapView from '../components/MapView'
import { Badge, Btn, Card, Chip, Empty, FreshBadge, Img, Sheet, Skeleton, stagger } from '../components/ui'
import InquirySheet from '../components/InquirySheet'
import { api, type Offer, type OffersResp, type ProductCard as PC } from '../lib/api'
import { useAsync, useStore } from '../lib/store'
import { useToast } from '../lib/toast'
import { cx, dist, faNum, tomanShort } from '../lib/format'

type Tab = 'shops' | 'map' | 'alts' | 'specs'
const SORTS = [['best', 'پیشنهادی'], ['price', 'ارزان‌ترین'], ['distance', 'نزدیک‌ترین'], ['fresh', 'تازه‌ترین قیمت']] as const
const HIDDEN_LABEL: Record<string, string> = { installment: 'قسطی نیستند', open_now: 'الان بسته‌اند', warranty: 'گارانتی ندارند', radius: 'خارج از محدوده‌اند' }

export default function Product() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const { loc, filters, setFilters, compare, toggleCompare } = useStore()
  const toast = useToast()
  const tabRefs = useRef<Partial<Record<Tab, HTMLButtonElement | null>>>({})
  const [indicator, setIndicator] = useState({ left: 0, width: 0 })
  const [tab, setTab] = useState<Tab>('shops')
  const [sort, setSort] = useState<string>('best')
  const [sel, setSel] = useState<string[]>([])
  const [sheet, setSheet] = useState<null | 'compare' | 'ask'>(null)
  const [allSpecs, setAllSpecs] = useState(false)

  const prod = useAsync(() => api.product(id), [id])
  const offers = useAsync<OffersResp>(() => api.offers(id, {
    lat: loc.lat, lon: loc.lon, sort, installment: filters.installment, open_now: filters.openNow,
    warranty: filters.warranty, radius_km: filters.radiusKm,
  }), [id, loc.lat, loc.lon, sort, filters.installment, filters.openNow, filters.warranty, filters.radiusKm])
  const alts = useAsync<PC[]>(() => api.alternatives(id, { lat: loc.lat, lon: loc.lon, installment: filters.installment }), [id, loc.lat, loc.lon, filters.installment])
  useEffect(() => { setSel([]); window.scrollTo(0, 0) }, [id])

  const p = prod.data
  const list = useMemo(() => offers.data?.items ?? [], [offers.data])
  const cheapest = useMemo(() => Math.min(...list.filter(o => o.price_ok && o.price).map(o => o.price!)), [list])
  const selected = list.filter(o => sel.includes(o.offer_id))
  const toggle = (oid: string) => setSel(s => (s.includes(oid) ? s.filter(x => x !== oid) : [...s, oid].slice(-8)))
  const hidden = Object.entries(offers.data?.hidden || {}).filter(([, n]) => n > 0)

  // Sliding underline under the active tab.
  useLayoutEffect(() => {
    const measure = () => {
      const el = tabRefs.current[tab]
      if (el) setIndicator({ left: el.offsetLeft, width: el.offsetWidth })
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [tab, list.length, alts.data?.length])

  const toggleCompareHere = () => {
    const had = compare.includes(id)
    toggleCompare(id)
    toast(had ? 'از مقایسه حذف شد' : 'به مقایسه اضافه شد', had ? 'info' : 'success')
  }

  if (prod.error) return <><AppBar back /><Page><Empty icon={<Info />} title={prod.error} /></Page></>

  const keySpecs = (p?.specs || []).filter(s => s.value && String(s.value).length < 60)
  return (
    <>
      <AppBar back title={p?.title ?? '…'} right={p && (
        <button onClick={toggleCompareHere} aria-pressed={compare.includes(id)} aria-label={compare.includes(id) ? 'حذف از مقایسه' : 'افزودن به مقایسه'}
          className={cx('grid size-10 place-items-center rounded-full transition-colors active:scale-90', compare.includes(id) ? 'animate-pop bg-brand-600 text-white' : 'hover:bg-slate-100')}><Scale size={19} /></button>
      )} />
      <Page className={cx(sel.length > 0 && '!pb-44')}>
        {!p ? <Skeleton className="h-64" /> : (
          <>
            <div className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-2 overflow-x-auto px-4">
              {(p.images.length ? p.images : [null]).map((src, i) => (
                <Img key={i} src={src} alt={i === 0 ? p.title : ''} className="h-56 w-[80%] shrink-0 animate-fade-up snap-center rounded-2xl ring-1 ring-line sm:w-72" />
              ))}
            </div>
            <h1 className="mt-4 animate-fade-up text-lg leading-8 font-black [animation-delay:80ms]">{p.title}</h1>
            <p className="text-xs text-ink-3">{[p.brand, p.category].filter(Boolean).join(' · ')}</p>

            <Card className="mt-3 animate-fade-up [animation-delay:140ms]">
              <div className="flex items-start justify-between gap-3">
                <PriceBlock p={p.price} />
                <FreshBadge f={p.freshness} />
              </div>
              <p className="mt-3 flex gap-1.5 rounded-xl bg-slate-50 p-2.5 text-xs leading-5 text-ink-2">
                <Info size={15} className="mt-0.5 shrink-0 text-ink-3" aria-hidden />
                این‌ها قیمت‌های <b>ثبت‌شده</b> فروشنده‌ها در ترب است، نه موجودی تأییدشده. قبل از رفتن، دستیار می‌تواند از فروشنده بپرسد.
              </p>
            </Card>
          </>
        )}

        <div role="tablist" className="no-scrollbar sticky top-14 z-[400] -mx-4 mt-4 flex gap-1 overflow-x-auto border-b border-line bg-surface/95 px-4 backdrop-blur">
          <span aria-hidden className="absolute bottom-0 h-0.5 rounded-full bg-brand-600 transition-all duration-300 ease-[var(--ease-out)]"
            style={{ left: indicator.left, width: indicator.width }} />
          {([['shops', 'فروشگاه‌ها', <Store key="i" size={16} />, list.length], ['map', 'نقشه', <MapIcon key="i" size={16} />],
            ['alts', 'جایگزین‌ها', <Repeat key="i" size={16} />, alts.data?.length], ['specs', 'مشخصات', <ListChecks key="i" size={16} />]] as const).map(([k, l, ic, n]) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k as Tab)} ref={el => { tabRefs.current[k as Tab] = el }}
              className={cx('flex min-h-11 shrink-0 items-center gap-1.5 px-2.5 text-sm font-bold whitespace-nowrap transition-colors',
                tab === k ? 'text-brand-700' : 'text-ink-3 hover:text-ink')}>
              {ic}{l}{n ? <span className="text-xs font-medium opacity-70">{faNum(n)}</span> : null}
            </button>
          ))}
        </div>

        {(tab === 'shops' || tab === 'map') && (
          <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4">
            {SORTS.map(([k, l]) => <Chip key={k} active={sort === k} onClick={() => setSort(k)}>{l}</Chip>)}
            <span className="mx-1 w-px shrink-0 bg-line" />
            <Chip active={filters.installment} onClick={() => setFilters({ installment: !filters.installment })}>قسطی</Chip>
            <Chip active={filters.openNow} onClick={() => setFilters({ openNow: !filters.openNow })}>الان باز</Chip>
            <Chip active={filters.warranty} onClick={() => setFilters({ warranty: !filters.warranty })}>گارانتی‌دار</Chip>
            <Chip active={!!filters.radiusKm} onClick={() => setFilters({ radiusKm: filters.radiusKm ? null : 3 })}>تا ۳ کیلومتر</Chip>
          </div>
        )}

        {tab === 'shops' && (
          <section key="shops" className="mt-3 animate-fade-in space-y-3">
            {hidden.length > 0 && (
              <p className="rounded-xl bg-amber-50 p-3 text-xs leading-6 text-amber-900 ring-1 ring-amber-200">
                {hidden.map(([k, n]) => `${faNum(n)} فروشگاه ${HIDDEN_LABEL[k]}`).join('، ')} و پنهان شدند.
              </p>
            )}
            {offers.data?.clusters.slice(0, 2).map(c => (
              <div key={c.passage} className="flex items-center gap-3 rounded-xl bg-accent-50 p-3 text-sm text-accent-900 ring-1 ring-accent-200">
                <Building2 size={20} className="shrink-0" aria-hidden />
                <p className="flex-1"><b>{faNum(c.count)} فروشنده</b> در «{c.passage}» — با یک مراجعه همه را ببین.</p>
                <button onClick={() => { setSel(list.filter(o => c.shop_ids.includes(o.shop.shop_id)).map(o => o.offer_id)); toast(`${faNum(c.count)} فروشگاه «${c.passage}» انتخاب شد`) }}
                  className="shrink-0 rounded-lg bg-white px-2.5 py-1.5 text-xs font-bold ring-1 ring-accent-200 hover:bg-accent-100">انتخاب همه</button>
              </div>
            ))}
            {list.length > 1 && !sel.length && (
              <button onClick={() => setSel(list.slice(0, 3).map(o => o.offer_id))}
                className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-brand-200 p-3 text-sm font-bold text-brand-800 hover:bg-brand-50">
                <MessageCircleQuestion size={18} />انتخاب ۳ پیشنهاد برتر برای استعلام موجودی
              </button>
            )}
            {offers.loading && !offers.data && [0, 1, 2].map(i => <Skeleton key={i} className="h-40" />)}
            {!offers.loading && !list.length && (
              <Empty icon={<Store size={26} />} title="با این فیلترها فروشگاهی نماند" text="فیلترها را کم کن یا جایگزین‌ها را ببین."
                action={<Btn variant="outline" onClick={() => setTab('alts')}>دیدن جایگزین‌ها</Btn>} />
            )}
            {list.map((o, i) => <OfferCard key={o.offer_id} o={o} index={i} cheapest={isFinite(cheapest) ? cheapest : null} selected={sel.includes(o.offer_id)} onSelect={() => toggle(o.offer_id)} />)}

            {!!offers.data?.maybe.length && (
              <div className="pt-4">
                <h3 className="font-bold">ممکن است داشته باشند</h3>
                <p className="mb-2 text-xs leading-5 text-ink-3">این فروشگاه‌ها در دسته «{p?.category}» فعالیت دارند ولی این کالا را ثبت نکرده‌اند. <b>موجودی کاملاً نامشخص است.</b></p>
                <div className="space-y-2">{offers.data.maybe.map(s => <MiniShop key={s.shop_id} s={s} />)}</div>
              </div>
            )}
          </section>
        )}

        {tab === 'map' && (
          <section key="map" className="mt-3 animate-fade-in">
            <MapView me={loc} className="h-[60vh]" onPick={sid => nav(`/shop/${sid}`)}
              pins={[...list.map((o, i) => ({ id: o.shop.shop_id, lat: o.shop.lat, lon: o.shop.lon, label: o.price_ok ? tomanShort(o.price) : 'استعلام', kind: (i === 0 && sort === 'best' ? 'best' : 'normal') as 'best' | 'normal' })),
                ...(offers.data?.maybe || []).map(s => ({ id: s.shop_id, lat: s.lat, lon: s.lon, label: '؟', kind: 'maybe' as const }))]} />
            <p className="mt-2 text-xs text-ink-3">برچسب‌ها قیمت ثبت‌شده‌اند؛ «؟» یعنی فروشگاه هم‌دسته با موجودی نامشخص. روی هر برچسب بزن تا جزئیات و مسیر را ببینی.</p>
          </section>
        )}

        {tab === 'alts' && (
          <section key="alts" className="mt-3 animate-fade-in space-y-3">
            <p className="text-sm text-ink-2">کالاهای هم‌دسته با قیمت نزدیک که در فروشگاه‌های اطرافت ثبت شده‌اند — اگر این مدل پیدا نشد.</p>
            {alts.loading && <Skeleton className="h-32" />}
            {!alts.loading && !alts.data?.length && <Empty icon={<Repeat size={24} />} title="جایگزین نزدیکی پیدا نشد" />}
            {alts.data?.map((a, i) => <ProductCard key={a.product_id} p={a} index={i} />)}
          </section>
        )}

        {tab === 'specs' && p && (
          <section key="specs" className="mt-3 animate-fade-in">
            {!keySpecs.length ? <Empty icon={<ListChecks size={24} />} title="مشخصاتی ثبت نشده" /> : (
              <Card className="!p-0">
                <dl className="divide-y divide-line">
                  {(allSpecs ? keySpecs : keySpecs.slice(0, 12)).map((s, i) => (
                    <div key={i} style={stagger(i % 12, 25)} className="grid animate-fade-up grid-cols-[40%_1fr] gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-slate-50">
                      <dt className="text-ink-3">{s.key}</dt><dd className="font-medium">{s.value}</dd>
                    </div>
                  ))}
                </dl>
                {keySpecs.length > 12 && (
                  <button onClick={() => setAllSpecs(v => !v)} className="flex w-full items-center justify-center gap-1 border-t border-line py-3 text-sm font-bold text-brand-700">
                    {allSpecs ? 'کمتر' : `همه ${faNum(keySpecs.length)} مشخصه`}<ChevronDown size={16} className={cx(allSpecs && 'rotate-180')} />
                  </button>
                )}
              </Card>
            )}
          </section>
        )}
      </Page>

      {sel.length > 0 && (
        <div className="fixed inset-x-0 bottom-16 z-[550] animate-[toast-in_0.35s_var(--ease-spring)_both] border-t border-line bg-white/95 px-4 py-3 shadow-float backdrop-blur">
          <div className="mx-auto flex max-w-3xl items-center gap-2">
            <Btn variant="outline" icon={<Table2 size={18} />} onClick={() => setSheet('compare')} disabled={sel.length < 2}>مقایسه</Btn>
            <Btn variant="primary" className="flex-1" icon={<MessageCircleQuestion size={18} />} onClick={() => setSheet('ask')}>
              بپرس از <span key={sel.length} className="inline-block animate-bump">{faNum(sel.length)}</span> فروشگاه
            </Btn>
          </div>
        </div>
      )}

      <Sheet open={sheet === 'compare'} onClose={() => setSheet(null)} title="مقایسه فروشگاه‌ها"
        footer={<Btn variant="primary" className="w-full" icon={<MessageCircleQuestion size={18} />} onClick={() => setSheet('ask')}>از همین‌ها بپرس</Btn>}>
        <ShopCompare items={selected} />
      </Sheet>
      {p && <InquirySheet open={sheet === 'ask'} onClose={() => setSheet(null)} product={p} offers={selected} />}
    </>
  )
}

function ShopCompare({ items }: { items: Offer[] }) {
  const best = (vals: (number | null)[], low = true) => {
    const v = vals.filter((x): x is number => x != null)
    return v.length ? (low ? Math.min(...v) : Math.max(...v)) : null
  }
  const minPrice = best(items.map(o => (o.price_ok ? o.price : null)))
  const minDist = best(items.map(o => o.shop.distance_m))
  const rows: [string, (o: Offer) => React.ReactNode][] = [
    ['قیمت ثبت‌شده', o => <span className={cx('font-bold', o.price_ok && o.price === minPrice && 'text-ok-700')}>{o.price_ok ? tomanShort(o.price) : <span className="text-amber-700">نامعتبر/ندارد</span>}</span>],
    ['به‌روزرسانی قیمت', o => <span className={cx(o.freshness.level === 'fresh' ? 'text-ok-700' : ['old', 'stale'].includes(o.freshness.level) ? 'text-amber-700' : '')}>{o.freshness.label.replace(' به‌روز شده', '')}</span>],
    ['فاصله', o => <span className={cx(o.shop.distance_m === minDist && 'font-bold text-ok-700')}>{dist(o.shop.distance_m)}</span>],
    ['زمان رسیدن', o => `${faNum(o.shop.travel_min)} دقیقه`],
    ['الان', o => <span className={cx(o.shop.open.state === 'open' ? 'text-ok-700' : o.shop.open.state === 'closed' ? 'text-red-700' : 'text-ink-3')}>{o.shop.open.label}</span>],
    ['اقساطی', o => (o.shop.installment.length ? o.shop.installment.join('، ') : <span className="text-ink-3">اعلام نشده</span>)],
    ['گارانتی', o => o.warranty || <span className="text-ink-3">ثبت نشده</span>],
    ['ارسال فوری', o => (o.shop.fast_delivery == null ? <span className="text-ink-3">نامشخص</span> : o.shop.fast_delivery ? 'دارد' : 'ندارد')],
    ['موجودی', () => <Badge tone="gray">تأیید نشده</Badge>],
    ['محل', o => [o.shop.passage, o.shop.floor && `ط ${o.shop.floor}`].filter(Boolean).join(' · ') || o.shop.area],
  ]
  return (
    <div className="-mx-5 overflow-x-auto px-5">
      <table className="w-full min-w-[480px] text-sm">
        <thead>
          <tr><th className="sticky right-0 bg-white" />{items.map(o => <th key={o.offer_id} className="px-2 pb-2 text-start align-bottom font-bold">{o.shop.name}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map(([label, f]) => (
            <tr key={label}>
              <th scope="row" className="sticky right-0 bg-white py-2.5 pe-3 text-start text-xs font-medium whitespace-nowrap text-ink-3">{label}</th>
              {items.map(o => <td key={o.offer_id} className="px-2 py-2.5 align-top text-xs leading-5">{f(o)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-xs text-ink-3">سبز = بهترین در آن ردیف. «نامشخص» یعنی فروشنده این اطلاعات را ثبت نکرده.</p>
    </div>
  )
}
