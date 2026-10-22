import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Bot, Check, CheckCheck, Clock3, CircleX, MessageCircleQuestion, Navigation, PackageCheck, Route, Send, Sparkles, Repeat, ChevronDown } from 'lucide-react'
import { AppBar, Page } from '../components/Layout'
import { OfferCard, ProductCard, Where } from '../components/Cards'
import { Badge, Btn, Card, Empty, OpenBadge, Skeleton, TypingDots, stagger } from '../components/ui'
import { api, type Batch, type Inquiry } from '../lib/api'
import { useStore } from '../lib/store'
import { useToast } from '../lib/toast'
import { agoTs, cx, dist, faNum, toman, tomanShort } from '../lib/format'

export function TrackList() {
  const { clientId } = useStore()
  const [list, setList] = useState<Batch[] | null>(null)
  useEffect(() => {
    const load = () => api.inquiries(clientId).then(setList).catch(() => setList([]))
    load()
    const t = setInterval(load, 5000)
    return () => clearInterval(t)
  }, [clientId])
  return (
    <>
      <AppBar title="استعلام‌های من" />
      <Page>
        {!list && <Skeleton className="h-24" />}
        {list && !list.length && (
          <Empty icon={<MessageCircleQuestion size={26} />} title="هنوز استعلامی نفرستاده‌ای"
            text="در صفحه هر کالا، فروشگاه‌ها را انتخاب کن تا دستیار موجودی و قیمت را قبل از رفتنت بپرسد."
            action={<Link to="/"><Btn>جستجوی کالا</Btn></Link>} />
        )}
        <div className="space-y-3">
          {list?.map((b, i) => (
            <Link key={b.batch_id} to={`/track/${b.batch_id}`} style={stagger(i)} className="lift block animate-fade-up rounded-2xl bg-white p-4 shadow-card">
              <div className="flex items-start justify-between gap-2">
                <p className="line-clamp-2 text-sm font-bold">{b.product_title}</p>
                {b.counts.available > 0 ? <Badge tone="green">{faNum(b.counts.available)} موجود</Badge>
                  : b.counts.pending ? <Badge tone="blue">در انتظار پاسخ</Badge> : <Badge tone="amber">ناموجود</Badge>}
              </div>
              <Progress b={b} />
              <p className="mt-2 text-xs text-ink-3">{agoTs(b.created_at)} · {faNum(b.counts.total)} فروشگاه{b.visit_at && ` · مراجعه ${b.visit_at}`}</p>
            </Link>
          ))}
        </div>
      </Page>
    </>
  )
}

function Progress({ b }: { b: Batch }) {
  const pending = b.counts.pending > 0
  return (
    <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar"
      aria-valuemin={0} aria-valuemax={b.counts.total} aria-valuenow={b.counts.done} aria-label="پیشرفت پاسخ فروشگاه‌ها">
      <div className="bg-ok-600 transition-all duration-700 ease-out" style={{ width: `${(b.counts.available / b.counts.total) * 100}%` }} />
      <div className="bg-slate-400 transition-all duration-700 ease-out" style={{ width: `${((b.counts.done - b.counts.available) / b.counts.total) * 100}%` }} />
      {pending && <div className="progress-stripes flex-1 bg-accent-200" />}
    </div>
  )
}

export function TrackDetail() {
  const { id = '' } = useParams()
  const { clientId, loc } = useStore()
  const nav = useNavigate()
  const toast = useToast()
  const [b, setB] = useState<Batch | null>(null)
  const [err, setErr] = useState('')
  const [sel, setSel] = useState<string[]>([])
  const [sending, setSending] = useState(false)

  useEffect(() => {
    let alive = true, t = 0
    const load = () => api.batch(id).then(x => {
      if (!alive) return
      setB(x)
      if (x.counts.pending > 0) t = window.setTimeout(load, 2500)
    }, e => alive && setErr(e.message))
    load()
    return () => { alive = false; clearTimeout(t) }
  }, [id])

  if (err) return <><AppBar back title="استعلام" /><Page><Empty icon={<CircleX />} title={err} /></Page></>
  if (!b) return <><AppBar back title="استعلام" /><Page><Skeleton className="h-40" /></Page></>
  const ag = b.agent
  const askMore = async () => {
    setSending(true)
    try {
      const first = b.items[0]
      const r = await api.createInquiry({ client_id: clientId, product_id: b.product_id, offer_ids: sel,
        questions: first.question_keys, visit_at: b.visit_at, lat: loc.lat, lon: loc.lon })
      toast(`استعلام برای ${faNum(sel.length)} فروشگاه دیگر ارسال شد`)
      setSel([])
      nav(`/track/${r.batch_id}`)
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      <AppBar back title="پیگیری استعلام" />
      <Page>
        <Link to={`/p/${b.product_id}`} className="text-sm font-bold leading-7 hover:text-brand-700">{b.product_title}</Link>
        <Progress b={b} />
        <p className="mt-1.5 text-xs text-ink-3">{faNum(b.counts.done)} از {faNum(b.counts.total)} فروشگاه پاسخ داده‌اند · {faNum(b.counts.available)} موجود</p>

        {ag && (
          <Card className={cx('mt-4 ring-1 transition-[box-shadow] duration-500', ag.state === 'found' ? 'animate-glow ring-ok-200' : ag.state === 'none' ? 'ring-amber-200' : 'ring-line')}>
            <div className="flex items-start gap-3" aria-live="polite">
              <span className={cx('relative grid size-9 shrink-0 place-items-center rounded-full text-white', ag.state === 'none' ? 'bg-amber-600' : ag.state === 'found' ? 'bg-ok-600' : 'bg-accent-600')}>
                {ag.state === 'waiting' && <span className="absolute inset-0 animate-ping rounded-full bg-accent-500/40" aria-hidden />}
                {ag.state === 'found' ? <PackageCheck size={18} className="animate-pop" /> : <Bot size={18} />}
              </span>
              <div className="flex-1">
                <p className="flex items-center gap-1.5 text-xs font-bold text-ink-3">دستیار{ag.state === 'waiting' && <TypingDots className="text-accent-600" />}</p>
                <p key={ag.message} className="animate-reveal text-sm leading-7">{ag.message}</p>
              </div>
            </div>
            {ag.route && (
              <div className="mt-3 animate-reveal rounded-xl bg-ok-50 p-3">
                <p className="mb-2 flex items-center gap-1.5 text-sm font-bold text-ok-800"><Route size={16} />برنامه مراجعه</p>
                <ol className="space-y-1.5">
                  {ag.route.stops.map((s, i) => (
                    <li key={s.inquiry_id} style={stagger(i, 90)} className="flex animate-fade-up items-center gap-2 text-sm">
                      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-ok-700 text-xs text-white">{faNum(i + 1)}</span>
                      <Link to={`/shop/${s.shop_id}`} className="min-w-0 flex-1 truncate font-medium hover:underline">{s.name}{s.passage && <span className="text-xs text-ink-3"> · {s.passage}</span>}</Link>
                      <OpenBadge open={s.open} short />
                    </li>
                  ))}
                </ol>
                <a href={ag.route.link} target="_blank" rel="noreferrer" className="group mt-3 flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand-600 text-sm font-bold text-white shadow-md shadow-brand-600/25 transition-all hover:-translate-y-0.5 hover:bg-brand-700 active:scale-[0.98]">
                  <Navigation size={17} className="transition-transform group-hover:-rotate-12" />مسیریابی در گوگل‌مپ
                </a>
              </div>
            )}
          </Card>
        )}

        <h2 className="mt-6 mb-2 font-bold">پاسخ فروشگاه‌ها</h2>
        <div className="space-y-3">{b.items.map((i, n) => <InquiryCard key={i.id} i={i} index={n} best={ag?.best === i.id} />)}</div>

        {!!ag?.more_shops.length && (
          <section className="mt-8 animate-fade-up">
            <h2 className="flex items-center gap-1.5 font-bold"><Sparkles size={18} className="animate-[wiggle_2.4s_ease-in-out_infinite] text-accent-600" />از این فروشگاه‌ها هم بپرسم؟</h2>
            <p className="mb-2 text-xs text-ink-3">فروشگاه‌های دیگری که همین کالا را ثبت کرده‌اند و هنوز از آن‌ها نپرسیده‌ایم.</p>
            <div className="space-y-3">
              {ag.more_shops.map((o, n) => <OfferCard key={o.offer_id} o={o} index={n} selected={sel.includes(o.offer_id)}
                onSelect={() => setSel(s => (s.includes(o.offer_id) ? s.filter(x => x !== o.offer_id) : [...s, o.offer_id]))} />)}
            </div>
            <Btn variant="primary" className="mt-3 w-full" icon={<Send size={17} />} loading={sending} disabled={!sel.length} onClick={askMore}>
              {sel.length ? `بپرس از ${faNum(sel.length)} فروشگاه دیگر` : 'فروشگاه‌ها را انتخاب کن'}
            </Btn>
          </section>
        )}
        {!!ag?.alternatives.length && (
          <section className="mt-8 animate-fade-up">
            <h2 className="flex items-center gap-1.5 font-bold"><Repeat size={18} className="text-brand-700" />کالاهای جایگزین در نزدیکی</h2>
            <p className="mb-2 text-xs text-ink-3">هم‌دسته و هم‌قیمت، در فروشگاه‌های اطراف ثبت شده‌اند.</p>
            <div className="space-y-3">{ag.alternatives.map((a, i) => <ProductCard key={a.product_id} p={a} index={i} />)}</div>
          </section>
        )}
      </Page>
    </>
  )
}

function Step({ done, active, icon, label, time, last }: { done: boolean; active?: boolean; icon: React.ReactNode; label: string; time?: number | null; last?: boolean }) {
  return (
    <li className={cx('relative flex flex-1 flex-col items-center gap-1 text-center text-[11px] transition-colors duration-500', done ? 'text-ok-800' : active ? 'text-ink-2' : 'text-slate-400')}>
      {!last && (
        <span aria-hidden className="absolute top-3.5 left-[-50%] right-[50%] -z-0 h-0.5 overflow-hidden bg-slate-200">
          <span className={cx('block h-full bg-ok-500 transition-[width] duration-700 ease-out', done ? 'w-full' : 'w-0')} />
        </span>
      )}
      <span className={cx('relative z-10 grid size-7 place-items-center rounded-full transition-colors duration-500', done ? 'bg-ok-100' : 'bg-slate-100', active && 'animate-pulse')}>
        {done ? <span key="d" className="animate-pop">{icon}</span> : icon}
      </span>
      <span className="font-medium">{label}</span>
      {time && <span className="text-[10px] text-ink-3">{agoTs(time)}</span>}
    </li>
  )
}

function InquiryCard({ i, best, index }: { i: Inquiry; best: boolean; index: number }) {
  const [open, setOpen] = useState(false)
  const r = i.reply
  const answered = i.status === 'answered'
  const diff = r?.price && i.listed_price ? r.price - i.listed_price : null
  return (
    <article style={stagger(index)} className={cx('animate-fade-up rounded-2xl bg-white p-4 shadow-card ring-2 transition-[box-shadow] duration-500', best ? 'animate-glow ring-ok-500' : 'ring-transparent')}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {best && <Badge tone="green" icon={<Sparkles size={12} />} className="mb-1">بهترین گزینه تأییدشده</Badge>}
          <Link to={`/shop/${i.shop.shop_id}`} className="block truncate font-bold hover:text-brand-700">{i.shop.name}</Link>
          <Where s={i.shop} />
          <p className="mt-0.5 text-xs text-ink-3">{dist(i.shop.distance_m)} · <OpenInline s={i.shop.open.label} /></p>
        </div>
        {answered && r && (r.available
          ? <Badge tone="green" className="shrink-0 whitespace-nowrap" icon={<PackageCheck size={13} />}>موجود است</Badge>
          : <Badge tone="red" className="shrink-0 whitespace-nowrap" icon={<CircleX size={13} />}>ناموجود</Badge>)}
        {i.status === 'no_answer' && <Badge tone="amber" className="shrink-0 whitespace-nowrap">پاسخ نداد</Badge>}
      </div>

      <ol className="mt-3 flex items-start">
        <Step done last={false} icon={<Send size={13} />} label="ارسال شد" time={i.created_at} />
        <Step done={!!i.seen_at} active={!i.seen_at} icon={<CheckCheck size={13} />} label="دیده شد" time={i.seen_at} />
        <Step done={answered} active={!!i.seen_at && !answered && i.status !== 'no_answer'}
          icon={i.status === 'no_answer' ? <Clock3 size={13} /> : <Check size={13} />} label={i.status === 'no_answer' ? 'بی‌پاسخ' : 'پاسخ داد'} time={i.answered_at} last />
      </ol>

      {answered && r && (
        <div className={cx('mt-3 animate-reveal space-y-1.5 rounded-xl p-3 text-sm', r.available ? 'bg-ok-50' : 'bg-slate-50')}>
          {r.price != null && (
            <p><span className="text-ink-3">قیمت اعلام‌شده امروز: </span><b>{toman(r.price)}</b>
              {diff != null && diff !== 0 && <span className={cx('text-xs', diff > 0 ? 'text-amber-700' : 'text-ok-700')}> ({diff > 0 ? '+' : '−'}{tomanShort(Math.abs(diff))} نسبت به قیمت ثبت‌شده)</span>}
            </p>
          )}
          {r.hold_until && <p><span className="text-ink-3">کنار گذاشته شد تا: </span><b>{r.hold_until}</b></p>}
          {r.installment && <p><span className="text-ink-3">اقساطی: </span>{r.installment}</p>}
          {r.warranty && <p><span className="text-ink-3">گارانتی: </span>{r.warranty}</p>}
          {r.colors && <p><span className="text-ink-3">رنگ‌ها: </span>{r.colors.join('، ')}</p>}
          {r.hours && <p><span className="text-ink-3">ساعت: </span>{r.hours}</p>}
          {r.note && <p className="text-ink-2">«{r.note}»</p>}
          <p className="pt-1 text-[11px] text-ink-3">{r.simulated ? 'پاسخ شبیه‌سازی‌شده (دمو) — شماره‌های دیتاست واقعی نیستند' : 'پاسخ مستقیم فروشنده از پنل فروشنده'}</p>
        </div>
      )}
      <button onClick={() => setOpen(v => !v)} className="mt-2 flex items-center gap-1 text-xs font-medium text-ink-3 hover:text-ink">
        پیام ارسال‌شده<ChevronDown size={14} className={cx(open && 'rotate-180')} />
      </button>
      {open && <pre className="mt-1 rounded-lg bg-slate-50 p-2.5 font-sans text-xs leading-6 whitespace-pre-wrap text-ink-2">{i.message}</pre>}
    </article>
  )
}

const OpenInline = ({ s }: { s: string }) => <span>{s}</span>
