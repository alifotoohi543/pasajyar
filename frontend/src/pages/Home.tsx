import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowUp, CreditCard, MessageCircleQuestion, MapPinned, Scale, Send, Sparkles, ChevronLeft, Store, PackageSearch, Tags } from 'lucide-react'
import { AppBar, Page } from '../components/Layout'
import { Badge, Card, CountUp, Toggle, stagger, useTypewriter } from '../components/ui'
import { useStore } from '../lib/store'
import { useToast } from '../lib/toast'
import { api, type Batch } from '../lib/api'
import { faNum, agoTs } from '../lib/format'

const EXAMPLES = [
  'هندزفری بلوتوث برای دویدن زیر ۳ میلیون',
  'برای مغازه‌ام دوربین مداربسته می‌خوام، نمی‌دونم چی بگیرم',
  'ساعت مچی مردانه تا ۵ میلیون',
  'جارو برقی برای خونه کوچیک',
]
const PLACEHOLDERS = ['گوشی برای عکاسی تا ۱۵ میلیون، قسطی', 'هدفون بی‌سیم برای باشگاه', 'دوربین مداربسته برای مغازه', 'پاوربانک فست‌شارژ نزدیک فردوسی']

const STEPS = [
  { icon: <Sparkles size={18} />, t: 'بگو چی لازم داری', d: 'حتی اگر مدل دقیقش را نمی‌دانی' },
  { icon: <MapPinned size={18} />, t: 'فروشگاه‌های نزدیک', d: 'با فاصله، ساعت کاری و مسیر' },
  { icon: <Scale size={18} />, t: 'مقایسه شفاف', d: 'قیمت، تازگی قیمت، قسطی، گارانتی' },
  { icon: <MessageCircleQuestion size={18} />, t: 'دستیار می‌پرسد', d: 'موجودی را قبل از رفتن تأیید می‌کند' },
]

const STATS = [
  { icon: <PackageSearch size={18} />, n: 225903, l: 'کالا' },
  { icon: <Tags size={18} />, n: 331506, l: 'قیمت ثبت‌شده' },
  { icon: <Store size={18} />, n: 6476, l: 'فروشگاه تهران' },
]

export default function Home() {
  const nav = useNavigate()
  const toast = useToast()
  const { filters, setFilters, clientId } = useStore()
  const [q, setQ] = useState('')
  const [focused, setFocused] = useState(false)
  const [recent, setRecent] = useState<Batch[]>([])
  const placeholder = useTypewriter(PLACEHOLDERS, !q && !focused)

  useEffect(() => {
    api.inquiries(clientId).then(b => setRecent(b.slice(0, 2))).catch(() => { /* optional section */ })
  }, [clientId])

  const go = (text: string) => {
    const t = text.trim()
    if (t) nav(`/s?q=${encodeURIComponent(t)}`)
  }
  const submit = (e: FormEvent) => { e.preventDefault(); go(q) }

  return (
    <>
      <AppBar />
      <Page className="!pt-0">
        <section className="relative -mx-4 overflow-hidden px-4 pt-8 pb-4">
          {/* decorative animated blobs, faded out towards the bottom edge */}
          <div aria-hidden className="pointer-events-none absolute inset-0 [mask-image:linear-gradient(to_bottom,black_55%,transparent)]">
            <div className="absolute -top-16 -left-10 size-56 animate-float rounded-full bg-brand-200/50 blur-3xl" />
            <div className="absolute top-24 -right-16 size-48 animate-float-slow rounded-full bg-accent-200/50 blur-3xl" />
            <div className="absolute bottom-0 left-1/3 size-40 animate-float rounded-full bg-ok-200/40 blur-3xl [animation-delay:-6s]" />
          </div>

          <div className="relative">
            <span className="inline-flex animate-fade-up items-center gap-1.5 rounded-full bg-white/80 px-3 py-1 text-xs font-bold text-brand-600 ring-1 ring-brand-100 backdrop-blur">
              <Sparkles size={14} className="animate-[wiggle_2.4s_ease-in-out_infinite]" />دستیار هوشمند خرید حضوری
            </span>
            <h1 className="mt-3 animate-fade-up text-[1.7rem] leading-[1.5] font-black [animation-delay:60ms]">
              چی می‌خوای <span className="text-shine">بخری؟</span>
            </h1>
            <p className="mt-1 animate-fade-up text-sm leading-7 text-ink-2 [animation-delay:120ms]">
              به زبان خودت بنویس؛ پاساژیار مدل مناسب، فروشگاه‌های نزدیک و بهترین زمان مراجعه را پیدا می‌کند.
            </p>

            <form onSubmit={submit}
              className="mt-4 animate-fade-up rounded-2xl bg-white/95 p-2 shadow-card ring-1 ring-line backdrop-blur transition-shadow duration-300 [animation-delay:180ms] focus-within:shadow-float focus-within:ring-2 focus-within:ring-brand-500">
              <label htmlFor="ask" className="sr-only">نیاز خرید</label>
              <div className="relative">
                <textarea id="ask" value={q} onChange={e => setQ(e.target.value)} rows={2} maxLength={300}
                  onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); go(q) } }}
                  className="relative z-10 w-full resize-none bg-transparent px-2 py-1.5 text-base outline-none" />
                {!q && (
                  <span aria-hidden className="pointer-events-none absolute inset-x-2 top-1.5 text-base text-slate-400">
                    مثلاً: {placeholder}<span className="animate-caret text-brand-500">|</span>
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between gap-2 px-1">
                <span className="text-xs text-ink-3">بودجه، کاربرد یا برند را هم بگو</span>
                <button type="submit" disabled={!q.trim()} aria-label="جستجو"
                  className="grid size-11 place-items-center rounded-xl bg-brand-600 text-white shadow-md shadow-brand-600/30 transition-all duration-200 hover:bg-brand-700 enabled:hover:-translate-y-0.5 active:scale-95 disabled:bg-slate-300 disabled:shadow-none">
                  <ArrowUp size={20} />
                </button>
              </div>
            </form>
          </div>
        </section>

        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 py-1">
          {EXAMPLES.map((e, i) => (
            <button key={e} onClick={() => go(e)} style={stagger(i + 4, 60)}
              className="flex min-h-10 shrink-0 animate-fade-up items-center gap-1 rounded-full border border-line bg-white px-3 text-sm text-ink-2 transition-all hover:-translate-y-0.5 hover:border-brand-500 hover:text-brand-700 active:scale-95">
              <Send size={13} className="text-brand-500" aria-hidden />{e}
            </button>
          ))}
        </div>

        <Card className="mt-4 animate-fade-up !p-3 ring-1 ring-orange-200 [animation-delay:300ms]">
          <Toggle checked={filters.installment}
            onChange={v => { setFilters({ installment: v }); toast(v ? 'فقط فروشگاه‌های اقساطی نمایش داده می‌شوند' : 'فیلتر اقساطی برداشته شد', 'info') }}
            label={<span className="flex items-center gap-1.5"><CreditCard size={16} className="text-orange-600" />فقط فروشگاه‌های دارای خرید اقساطی</span>}
            hint="ترب‌پی، اسنپ‌پی، دیجی‌پی، تارا — طبق اعلام فروشنده" />
        </Card>

        {recent.length > 0 && (
          <section className="mt-6">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-bold">استعلام‌های اخیر</h2>
              <Link to="/track" className="group flex items-center text-sm font-medium text-brand-600">همه<ChevronLeft size={16} className="transition-transform group-hover:-translate-x-0.5" /></Link>
            </div>
            <div className="space-y-2">
              {recent.map((b, i) => (
                <Link key={b.batch_id} to={`/track/${b.batch_id}`} style={stagger(i)}
                  className="lift flex animate-fade-up items-center gap-3 rounded-2xl bg-white p-3 shadow-card">
                  <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600"><MessageCircleQuestion size={20} /></div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{b.product_title}</p>
                    <p className="text-xs text-ink-3">{agoTs(b.created_at)} · {faNum(b.counts.done)} از {faNum(b.counts.total)} پاسخ داده‌اند</p>
                  </div>
                  {b.counts.available > 0 ? <Badge tone="green">{faNum(b.counts.available)} موجود</Badge>
                    : b.counts.pending ? <Badge tone="blue">در انتظار</Badge> : <Badge tone="amber">ناموجود</Badge>}
                </Link>
              ))}
            </div>
          </section>
        )}

        <section className="mt-8">
          <h2 className="mb-3 font-bold">چطور کار می‌کند؟</h2>
          <ol className="grid grid-cols-2 gap-2">
            {STEPS.map((s, i) => (
              <li key={s.t} style={stagger(i, 80)} className="lift group animate-fade-up rounded-2xl bg-white p-3 shadow-card">
                <div className="flex items-center gap-2">
                  <span className="grid size-8 place-items-center rounded-lg bg-brand-50 text-brand-600 transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-6">{s.icon}</span>
                  <span className="text-xs font-bold text-ink-3">گام {faNum(i + 1)}</span>
                </div>
                <p className="mt-2 text-sm font-bold">{s.t}</p>
                <p className="text-xs text-ink-3">{s.d}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-6 grid grid-cols-3 gap-2" aria-label="داده‌های ترب">
          {STATS.map((s, i) => (
            <div key={s.l} style={stagger(i, 90)} className="animate-fade-up rounded-2xl bg-white p-3 text-center shadow-card">
              <span className="mx-auto grid size-8 place-items-center rounded-lg bg-accent-50 text-accent-600">{s.icon}</span>
              <p className="mt-1.5 text-base font-black"><CountUp to={s.n} /></p>
              <p className="text-[11px] text-ink-3">{s.l}</p>
            </div>
          ))}
        </section>
        <p className="mt-3 text-center text-xs text-ink-3">داده‌ها از دیتاست ترب؛ قیمت‌ها «ثبت‌شده» هستند و موجودی را دستیار از فروشنده می‌پرسد.</p>
      </Page>
    </>
  )
}
