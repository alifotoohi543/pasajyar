import { useParams, Link } from 'react-router-dom'
import { Building2, Clock, CreditCard, ExternalLink, Footprints, Globe, AtSign, Layers, MapPin, Navigation, Phone, Search, Store, DoorOpen, Truck } from 'lucide-react'
import { AppBar, Page } from '../components/Layout'
import MapView from '../components/MapView'
import { Badge, Card, Empty, FreshBadge, Img, OpenBadge, Skeleton, stagger } from '../components/ui'
import { api } from '../lib/api'
import { useAsync, useStore } from '../lib/store'
import { cx, dist, faNum, tomanShort, travel } from '../lib/format'

export default function Shop() {
  const { id = '' } = useParams()
  const { loc } = useStore()
  const { data: s, error } = useAsync(() => api.shop(id, loc.lat, loc.lon), [id, loc.lat, loc.lon])
  if (error) return <><AppBar back /><Page><Empty icon={<Store />} title={error} /></Page></>
  if (!s) return <><AppBar back title="فروشگاه" /><Page><Skeleton className="h-60" /></Page></>

  const steps = [
    s.address && { icon: <MapPin size={16} />, t: 'آدرس', d: s.address },
    s.passage && { icon: <Building2 size={16} />, t: 'وارد این مجموعه شو', d: s.passage },
    s.floor && { icon: <Layers size={16} />, t: 'طبقه', d: s.floor },
    (s.unit || s.plaque) && { icon: <DoorOpen size={16} />, t: s.unit ? 'واحد' : 'پلاک', d: s.unit || s.plaque },
  ].filter(Boolean) as { icon: React.ReactNode; t: string; d: string }[]

  return (
    <>
      <AppBar back title={s.name} />
      <Page>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-black">{s.name}</h1>
            <p className="text-sm text-ink-3">{s.area} · {faNum(s.offer_count)} کالای ثبت‌شده</p>
          </div>
          <OpenBadge open={s.open} />
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Badge tone="gray" icon={<Footprints size={12} />}>{dist(s.distance_m)} · {travel(s.travel_min, s.travel_mode)}</Badge>
          {s.installment.length > 0 && <Badge tone="orange" icon={<CreditCard size={12} />}>اقساطی: {s.installment.join('، ')}</Badge>}
          {s.fast_delivery != null && <Badge tone={s.fast_delivery ? 'blue' : 'gray'} icon={<Truck size={12} />}>{s.fast_delivery ? 'ارسال فوری دارد' : 'ارسال فوری ندارد'}</Badge>}
        </div>

        <Card className="mt-4 animate-fade-up" style={stagger(1, 80)}>
          <h2 className="mb-3 flex items-center gap-1.5 font-bold"><Navigation size={18} className="text-brand-700" />چطور پیدایش کنم؟</h2>
          <ol className="relative space-y-3 border-s-2 border-dashed border-brand-200 ps-4">
            {steps.map((st, i) => (
              <li key={st.t} className="relative animate-fade-up" style={stagger(i + 2, 110)}>
                <span className="absolute -start-[27px] top-0.5 grid size-5 place-items-center rounded-full bg-brand-700 text-white">{st.icon && <span className="scale-75">{st.icon}</span>}</span>
                <p className="text-xs text-ink-3">{st.t}</p>
                <p className="text-sm font-medium leading-6">{st.d}</p>
              </li>
            ))}
          </ol>
          <MapView me={loc} className="mt-4 h-48" pins={[{ id: s.shop_id, lat: s.lat, lon: s.lon, label: s.name, kind: 'best' }]} />
          <div className="mt-3 grid grid-cols-3 gap-2">
            {[['google_route', 'گوگل‌مپ'], ['neshan', 'نشان'], ['balad', 'بلد']].map(([k, l]) => (
              <a key={k} href={s.links[k]} target="_blank" rel="noreferrer" className="flex min-h-11 items-center justify-center gap-1 rounded-xl border border-line text-sm font-bold hover:border-brand-500">
                {l}<ExternalLink size={13} className="text-ink-3" />
              </a>
            ))}
          </div>
          {s.links.google_passage && (
            <a href={s.links.google_passage} target="_blank" rel="noreferrer" className="mt-2 flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-slate-50 text-sm text-ink-2 hover:bg-slate-100">
              <Search size={15} />پاساژ را پیدا نمی‌کنی؟ جستجوی «{s.passage}» در گوگل‌مپ
            </a>
          )}
          {s.neighbours.length > 0 && (
            <p className="mt-3 text-xs leading-6 text-ink-3">
              همسایه‌ها در همین مجموعه: {s.neighbours.slice(0, 4).map(n => [n.name, n.floor && `ط ${n.floor}`].filter(Boolean).join(' ')).join('، ')} — اگر واحد را پیدا نکردی از آن‌ها بپرس.
            </p>
          )}
        </Card>

        <Card className="mt-4 animate-fade-up" style={stagger(2, 80)}>
          <h2 className="mb-2 flex items-center gap-1.5 font-bold"><Clock size={18} className="text-brand-700" />ساعت کاری</h2>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-line">
              {s.week.map(w => (
                <tr key={w.day}><th scope="row" className="py-2 text-start font-medium">{w.day}</th>
                  <td className={cx('py-2 text-end', w.status === 'closed' ? 'text-red-700' : w.status === 'unknown' ? 'text-ink-3' : '')}>{w.text}</td></tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-ink-3">طبق اعلام فروشنده در ترب. روزهای «نامشخص» ثبت نشده‌اند.</p>
        </Card>

        <Card className="mt-4 animate-fade-up" style={stagger(3, 80)}>
          <h2 className="mb-2 flex items-center gap-1.5 font-bold"><CreditCard size={18} className="text-orange-600" />شرایط پرداخت</h2>
          {s.payments.length ? (
            <ul className="space-y-1.5 text-sm">
              {s.payments.map((p, i) => (
                <li key={i} className="flex items-center justify-between"><span className="font-medium">{p.provider_name}</span>
                  <Badge tone={p.channel === 'in_person' ? 'green' : 'gray'}>{p.channel === 'in_person' ? 'پذیرنده حضوری (اعلام فروشنده)' : 'نوع پذیرش نامشخص'}</Badge></li>
              ))}
            </ul>
          ) : <p className="text-sm text-ink-3">فروشنده سرویس اقساطی یا روش پرداخت خاصی اعلام نکرده است (نامشخص).</p>}
        </Card>

        <Card className="mt-4">
          <h2 className="mb-2 font-bold">ارتباط</h2>
          <div className="flex flex-wrap gap-2">
            {s.phone && <a href={`tel:${s.phone}`} className="flex min-h-10 items-center gap-1.5 rounded-xl border border-line px-3 text-sm"><Phone size={15} />{s.phone}</a>}
            {s.instagram && <a href={s.instagram} target="_blank" rel="noreferrer" className="flex min-h-10 items-center gap-1.5 rounded-xl border border-line px-3 text-sm"><AtSign size={15} />اینستاگرام</a>}
            {s.website && <a href={s.website} target="_blank" rel="noreferrer" className="flex min-h-10 items-center gap-1.5 rounded-xl border border-line px-3 text-sm"><Globe size={15} />وبسایت</a>}
          </div>
          <p className="mt-2 text-xs text-ink-3">به‌جای تماس، می‌توانی از صفحه کالا از دستیار بخواهی سؤالت را بپرسد و پیگیری کند.</p>
        </Card>

        {s.products.length > 0 && (
          <section className="mt-6">
            <h2 className="mb-2 font-bold">کالاهای ثبت‌شده این فروشگاه</h2>
            <div className="grid grid-cols-2 gap-2">
              {s.products.slice(0, 20).map((p, i) => (
                <Link key={p.product_id} to={`/p/${p.product_id}`} style={stagger(i, 35)} className="lift animate-fade-up rounded-2xl bg-white p-2.5 shadow-card">
                  <Img src={p.image} alt="" className="h-24 w-full rounded-lg" />
                  <p className="mt-1.5 line-clamp-2 text-xs font-medium leading-5">{p.title}</p>
                  <p className="mt-1 text-sm font-bold">{p.price_ok ? `${tomanShort(p.price)} ت` : <span className="text-xs text-amber-700">قیمت نامعتبر</span>}</p>
                  <div className="mt-1"><FreshBadge f={p.freshness} /></div>
                </Link>
              ))}
            </div>
          </section>
        )}
        {s.categories.length > 0 && (
          <p className="mt-6 text-xs leading-6 text-ink-3">دسته‌های فعالیت: {s.categories.slice(0, 12).join('، ')} — دسته فعالیت به‌تنهایی نشانه موجود بودن کالا نیست.</p>
        )}
      </Page>
    </>
  )
}
