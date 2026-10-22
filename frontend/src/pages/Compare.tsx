import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Scale, X } from 'lucide-react'
import { AppBar, Page } from '../components/Layout'
import { Btn, Empty, Img, Skeleton } from '../components/ui'
import { api } from '../lib/api'
import { useAsync, useStore } from '../lib/store'
import { cx, dist, faNum, tomanShort } from '../lib/format'

export default function Compare() {
  const { compare, toggleCompare, clearCompare, loc } = useStore()
  const { data, loading } = useAsync(() => (compare.length ? api.compare(compare, loc.lat, loc.lon) : Promise.resolve([])), [compare.join(','), loc.lat, loc.lon])

  const specRows = useMemo(() => {
    if (!data?.length) return []
    const keys: string[] = []
    data.forEach(p => p.specs.forEach(s => { if (s.value && String(s.value).length < 50 && !keys.includes(s.key)) keys.push(s.key) }))
    return keys
      .map(k => ({ k, vals: data.map(p => p.specs.find(s => s.key === k)?.value ?? null) }))
      .filter(r => r.vals.filter(Boolean).length >= Math.min(2, data.length))
      .slice(0, 25)
  }, [data])

  if (!compare.length)
    return <><AppBar title="مقایسه کالاها" /><Page><Empty icon={<Scale size={26} />} title="کالایی برای مقایسه انتخاب نشده"
      text="در نتایج جستجو، دکمه ترازو کنار هر کالا را بزن (حداکثر ۴ کالا)." action={<Link to="/"><Btn>جستجو</Btn></Link>} /></Page></>

  const medians = data?.map(p => p.price.median) || []
  const minMed = Math.min(...medians.filter((x): x is number => x != null))
  return (
    <>
      <AppBar title="مقایسه کالاها" right={<button onClick={clearCompare} className="px-3 text-sm font-medium text-red-700">پاک کردن</button>} />
      <Page>
        {loading && <Skeleton className="h-60" />}
        {data && (
          <div className="-mx-4 overflow-x-auto px-4">
            <table className="w-full min-w-[520px] border-separate border-spacing-0 text-sm">
              <thead>
                <tr>
                  <th className="sticky right-0 z-10 w-28 bg-surface" />
                  {data.map((p, i) => (
                    <th key={p.product_id} className="p-2 align-top font-normal">
                      <div className="relative animate-fade-up rounded-2xl bg-white p-2 shadow-card" style={{ animationDelay: `${i * 70}ms` }}>
                        <button onClick={() => toggleCompare(p.product_id)} aria-label="حذف از مقایسه" className="absolute top-1 left-1 grid size-8 place-items-center rounded-full bg-white/90 hover:bg-slate-100"><X size={15} /></button>
                        <Img src={p.image} alt="" className="h-24 w-full rounded-lg" />
                        <Link to={`/p/${p.product_id}`} className="mt-1.5 line-clamp-3 text-start text-xs leading-5 font-bold hover:text-brand-700">{p.title}</Link>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <Row label="قیمت میانه" vals={data.map(p => <span key={p.product_id} className={cx('font-black', p.price.median === minMed && 'text-ok-700')}>{p.price.median ? tomanShort(p.price.median) : 'نامشخص'}</span>)} />
                <Row label="بازه قیمت" vals={data.map(p => p.price.min ? `${tomanShort(p.price.min)} – ${tomanShort(p.price.max)}` : '—')} />
                <Row label="فروشگاه نزدیک" vals={data.map(p => p.near.count ? `${faNum(p.near.count)} · ${dist(p.near.nearest_m)}` : 'ندارد')} />
                <Row label="باز در این لحظه" vals={data.map(p => faNum(p.near.open_now))} />
                <Row label="تازگی قیمت" vals={data.map(p => p.freshness.label)} />
                <Row label="برند" vals={data.map(p => p.brand || '—')} />
                {specRows.map(r => {
                  const differs = new Set(r.vals.map(v => v ?? '')).size > 1
                  return <Row key={r.k} label={r.k} highlight={differs} vals={r.vals.map((v, i) => v ?? <span key={i} className="text-ink-3">ثبت نشده</span>)} />
                })}
              </tbody>
            </table>
            <p className="mt-3 text-xs text-ink-3">ردیف‌های پررنگ‌شده تفاوت دارند. قیمت‌ها ثبت‌شده‌اند و موجودی تأیید نشده.</p>
          </div>
        )}
      </Page>
    </>
  )
}

function Row({ label, vals, highlight }: { label: string; vals: React.ReactNode[]; highlight?: boolean }) {
  return (
    <tr className={cx(highlight && '[&>td]:bg-amber-50/60')}>
      <th scope="row" className="sticky right-0 z-10 border-b border-line bg-surface py-2.5 pe-2 text-start align-top text-xs font-medium text-ink-3">{label}</th>
      {vals.map((v, i) => <td key={i} className="border-b border-line px-2 py-2.5 align-top text-xs leading-5">{v}</td>)}
    </tr>
  )
}
