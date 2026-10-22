import { Link } from 'react-router-dom'
import { Check, AlertTriangle, MapPin, Footprints, Car, Building2, CreditCard, Scale, Store, Sparkles } from 'lucide-react'
import type { Offer, ProductCard as PC } from '../lib/api'
import { cx, dist, faNum, toman, tomanShort } from '../lib/format'
import { Badge, FreshBadge, Img, OpenBadge, StockNote, stagger } from './ui'
import { useStore } from '../lib/store'
import { useToast } from '../lib/toast'

export function PriceBlock({ p, compact }: { p: PC['price']; compact?: boolean }) {
  if (!p.median)
    return <p className="text-sm font-medium text-ink-3">قیمت معتبری ثبت نشده — از فروشنده بپرسید</p>
  return (
    <div>
      <p className={cx('font-black text-ink', compact ? 'text-base' : 'text-lg')}>
        {tomanShort(p.median)} <span className="text-xs font-medium text-ink-3">تومان (میانه)</span>
      </p>
      {p.priced_offers > 1 && p.min !== p.max && (
        <p className="text-xs text-ink-3">بازه ثبت‌شده: {tomanShort(p.min)} تا {tomanShort(p.max)}{p.wide_spread && <span className="text-amber-700"> · اختلاف قیمت زیاد</span>}</p>
      )}
    </div>
  )
}

export function ProductCard({ p, pick, index = 0 }: { p: PC; pick?: string; index?: number }) {
  const { compare, toggleCompare } = useStore()
  const toast = useToast()
  const inCompare = compare.includes(p.product_id)
  const onCompare = () => {
    toggleCompare(p.product_id)
    toast(inCompare ? 'از مقایسه حذف شد' : compare.length >= 4 ? 'به مقایسه اضافه شد (قدیمی‌ترین حذف شد)' : 'به مقایسه اضافه شد', inCompare ? 'info' : 'success')
  }
  return (
    <article className={cx('lift group relative flex animate-fade-up gap-3 rounded-2xl bg-white p-3 shadow-card', pick && 'ring-2 ring-accent-500')}
      style={stagger(index)}>
      <Link to={`/p/${p.product_id}`} className="absolute inset-0 z-0 rounded-2xl" aria-label={p.title} />
      <div className="size-24 shrink-0 overflow-hidden rounded-xl ring-1 ring-line">
        <Img src={p.image} alt="" className="size-full transition-transform duration-500 group-hover:scale-105" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        {pick && <Badge tone="blue" icon={<Sparkles size={12} />} className="self-start">پیشنهاد دستیار</Badge>}
        <h3 className="line-clamp-2 text-sm font-bold leading-6">{p.title}</h3>
        <PriceBlock p={p.price} compact />
        <div className="flex flex-wrap items-center gap-1.5">
          {p.near.count > 0 ? (
            <Badge tone="green" icon={<Store size={12} />}>{faNum(p.near.count)} فروشگاه · نزدیک‌ترین {dist(p.near.nearest_m)}</Badge>
          ) : <Badge tone="gray">فروشگاه نزدیکی ثبت نشده</Badge>}
          {p.near.open_now > 0 && <Badge tone="blue">{faNum(p.near.open_now)} باز است</Badge>}
          <FreshBadge f={p.freshness} />
        </div>
        {pick && <p className="text-xs leading-5 text-accent-700">{pick}</p>}
        {p.why && <p className="text-xs leading-5 text-ink-2">{p.why}</p>}
      </div>
      <button onClick={onCompare} aria-pressed={inCompare} aria-label={inCompare ? 'حذف از مقایسه' : 'افزودن به مقایسه'}
        className={cx('relative z-10 grid size-10 shrink-0 place-items-center self-start rounded-full ring-1 transition-colors active:scale-90',
          inCompare ? 'animate-pop bg-brand-600 text-white ring-brand-600' : 'bg-white text-ink-3 ring-line hover:text-brand-600')}>
        <Scale size={17} />
      </button>
    </article>
  )
}

export function Where({ s }: { s: Offer['shop'] }) {
  const parts = [s.passage, s.floor && `طبقه ${s.floor}`, (s.unit && `واحد ${s.unit}`) || (s.plaque && `پلاک ${s.plaque}`)].filter(Boolean)
  return (
    <p className="flex items-start gap-1 text-xs text-ink-2">
      <Building2 size={13} className="mt-0.5 shrink-0 text-ink-3" aria-hidden />
      <span>{parts.length ? parts.join(' · ') : (s.address || s.area || 'آدرس دقیق ثبت نشده')}</span>
    </p>
  )
}

export function OfferCard({ o, selected, onSelect, cheapest, index = 0 }: {
  o: Offer; selected?: boolean; onSelect?: () => void; cheapest?: number | null; index?: number
}) {
  const s = o.shop
  const delta = o.price_ok && cheapest && o.price && o.price > cheapest ? o.price - cheapest : 0
  return (
    <article style={stagger(index)}
      className={cx('animate-fade-up rounded-2xl bg-white p-4 shadow-card ring-2 transition-[box-shadow,background-color] duration-200',
        selected ? 'bg-brand-50/40 ring-brand-500' : 'ring-transparent')}>
      <div className="flex items-start gap-3">
        {onSelect && (
          <input type="checkbox" checked={!!selected} onChange={onSelect} aria-label={`انتخاب ${s.name} برای استعلام`}
            className={cx('mt-1 size-5 shrink-0 cursor-pointer accent-brand-600 transition-transform', selected && 'animate-pop')} />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              {o.badge && <Badge tone="blue" icon={<Sparkles size={12} />} className="mb-1">{o.badge}</Badge>}
              <Link to={`/shop/${s.shop_id}`} className="block truncate font-bold hover:text-brand-700">{s.name}</Link>
              <Where s={s} />
            </div>
            <div className="shrink-0 text-end">
              {o.price_ok ? (
                <>
                  <p className="font-black">{tomanShort(o.price)}</p>
                  <p className="text-[11px] text-ink-3">{delta ? `${tomanShort(delta)} گران‌تر` : 'تومان · ثبت‌شده'}</p>
                </>
              ) : (
                <p className="max-w-28 text-xs font-medium text-amber-700">{o.price ? `${tomanShort(o.price)}؟` : 'بدون قیمت'}</p>
              )}
            </div>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Badge tone="gray" icon={s.travel_mode === 'walk' ? <Footprints size={12} /> : <Car size={12} />}>
              {dist(s.distance_m)} · {faNum(s.travel_min)} دقیقه
            </Badge>
            <OpenBadge open={s.open} short />
            <FreshBadge f={o.freshness} />
            {s.installment.length > 0 && <Badge tone="orange" icon={<CreditCard size={12} />}>قسطی</Badge>}
            <StockNote kind="unverified" />
          </div>

          {(o.reasons.length > 0 || o.cautions.length > 0) && (
            <ul className="mt-2.5 space-y-1 text-xs">
              {o.reasons.slice(0, 4).map(r => <li key={r} className="flex gap-1.5 text-ok-800"><Check size={14} className="shrink-0" aria-hidden />{r}</li>)}
              {o.cautions.slice(0, 3).map(r => <li key={r} className="flex gap-1.5 text-amber-800"><AlertTriangle size={14} className="shrink-0" aria-hidden />{r}</li>)}
            </ul>
          )}
          {o.other_listings > 0 && <p className="mt-1.5 text-[11px] text-ink-3">+ {faNum(o.other_listings)} آگهی دیگر از همین فروشنده</p>}
          <p className="mt-1 line-clamp-1 text-[11px] text-ink-3">عنوان فروشنده: {o.seller_title}</p>
        </div>
      </div>
    </article>
  )
}

export function MiniShop({ s }: { s: Offer['shop'] }) {
  return (
    <Link to={`/shop/${s.shop_id}`} className="lift flex items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-white p-3 hover:border-brand-500">
      <MapPin size={18} className="shrink-0 text-ink-3" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold">{s.name}</p>
        <p className="truncate text-xs text-ink-3">{s.passage || s.area} · {dist(s.distance_m)}</p>
      </div>
      <OpenBadge open={s.open} short />
    </Link>
  )
}

export const priceText = (n: number | null | undefined) => toman(n ?? null)
