import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Bell, CheckCircle2, Inbox, Store, XCircle } from 'lucide-react'
import { AppBar, Page } from '../components/Layout'
import { Badge, Btn, Card, Chip, Empty, Toggle, stagger } from '../components/ui'
import { useToast } from '../lib/toast'
import { api, type Inquiry, type ShopBrief } from '../lib/api'
import { agoTs, faNum, toman } from '../lib/format'

const QUICK = ['بفرمایید، منتظرتان هستیم.', 'موجود است، فقط زودتر تشریف بیاورید.', 'تمام کرده‌ایم، مدل مشابه داریم.', 'فردا شارژ می‌شود.']

export default function Seller() {
  const [sp, setSp] = useSearchParams()
  const shopId = sp.get('shop')
  const [shops, setShops] = useState<{ shop_id: string; name: string; count: number }[]>([])
  const [inbox, setInbox] = useState<{ shop: ShopBrief; items: Inquiry[] } | null>(null)
  const [manual, setManual] = useState('')

  useEffect(() => { if (!shopId) api.sellerShops().then(setShops).catch(() => {}) }, [shopId])
  const load = useCallback(() => { if (shopId) api.sellerInbox(shopId).then(setInbox).catch(() => setInbox(null)) }, [shopId])
  useEffect(() => {
    load()
    const t = setInterval(load, 4000)
    return () => clearInterval(t)
  }, [load])

  if (!shopId)
    return (
      <>
        <AppBar title="پنل فروشنده (دمو)" right={<span />} />
        <Page>
          <Card className="ring-1 ring-accent-200">
            <p className="text-sm leading-7 text-ink-2">
              این پنل نشان می‌دهد سمت فروشنده چه می‌بیند: پیام دستیار، زمان مراجعه مشتری و درخواست کنار گذاشتن کالا.
              با باز کردن پنل یک فروشگاه، پاسخ خودکار (شبیه‌سازی) برای آن خاموش می‌شود و پاسخ را خودتان می‌دهید.
            </p>
          </Card>
          <h2 className="mt-5 mb-2 font-bold">فروشگاه‌هایی که استعلام گرفته‌اند</h2>
          {!shops.length && <Empty icon={<Inbox size={24} />} title="هنوز استعلامی ثبت نشده" text="اول از صفحه یک کالا از چند فروشگاه استعلام بگیر." />}
          <div className="space-y-2">
            {shops.map((s, i) => (
              <button key={s.shop_id} onClick={() => setSp({ shop: s.shop_id })} style={stagger(i)} className="lift flex w-full animate-fade-up items-center gap-3 rounded-2xl bg-white p-3 text-start shadow-card">
                <span className="grid size-10 place-items-center rounded-xl bg-brand-50 text-brand-700"><Store size={20} /></span>
                <span className="flex-1 font-bold">{s.name}</span>
                <Badge tone="blue">{faNum(s.count)} استعلام</Badge>
              </button>
            ))}
          </div>
          <form className="mt-5 flex gap-2" onSubmit={e => { e.preventDefault(); if (manual.trim()) setSp({ shop: manual.trim() }) }}>
            <input value={manual} onChange={e => setManual(e.target.value)} placeholder="یا شناسه فروشگاه (shop_…)" aria-label="شناسه فروشگاه" className="h-11 min-w-0 flex-1 rounded-xl border border-line px-3 text-sm ltr-nums" />
            <Btn type="submit" variant="outline">ورود</Btn>
          </form>
        </Page>
      </>
    )

  const pending = inbox?.items.filter(i => i.status !== 'answered') || []
  const done = inbox?.items.filter(i => i.status === 'answered') || []
  return (
    <>
      <AppBar back title={inbox?.shop.name ?? 'پنل فروشنده'} right={
        <button onClick={() => { api.sellerRelease(shopId).finally(() => setSp({})) }} className="px-3 text-xs font-medium text-ink-3 hover:text-ink">خروج</button>
      } />
      <Page>
        <div className="flex items-center gap-2 rounded-xl bg-accent-50 p-3 text-sm text-accent-900">
          <Bell size={18} className="shrink-0" />
          {pending.length ? `${faNum(pending.length)} استعلام منتظر پاسخ شماست.` : 'استعلام جدیدی نیست. صفحه خودکار به‌روز می‌شود.'}
        </div>
        <div className="mt-4 space-y-3">{pending.map((i, n) => <ReplyCard key={i.id} i={i} index={n} onDone={load} />)}</div>
        {done.length > 0 && (
          <>
            <h2 className="mt-6 mb-2 text-sm font-bold text-ink-3">پاسخ داده‌شده</h2>
            <div className="space-y-2">
              {done.map(i => (
                <div key={i.id} className="flex animate-fade-up items-center gap-2 rounded-xl bg-white p-3 text-sm shadow-card">
                  {i.reply?.available ? <CheckCircle2 size={18} className="text-ok-700" /> : <XCircle size={18} className="text-red-600" />}
                  <span className="min-w-0 flex-1 truncate">{i.product_title}</span>
                  <span className="text-xs text-ink-3">{i.answered_at && agoTs(i.answered_at)}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </Page>
    </>
  )
}

function ReplyCard({ i, onDone, index }: { i: Inquiry; onDone: () => void; index: number }) {
  const toast = useToast()
  const [available, setAvailable] = useState(true)
  const [price, setPrice] = useState(i.listed_price ? String(i.listed_price) : '')
  const [hold, setHold] = useState(!!i.visit_at)
  const [installment, setInstallment] = useState('')
  const [note, setNote] = useState(QUICK[0])
  const [busy, setBusy] = useState(false)
  const send = async () => {
    setBusy(true)
    try {
      await api.sellerReply(i.id, {
        available, price: available && price ? +price.replace(/[^\d]/g, '') : null,
        hold_until: available && hold ? i.visit_at : null, installment: installment || null, note,
      })
      toast(available ? 'پاسخ «موجود است» برای مشتری ارسال شد' : 'پاسخ «ناموجود» ارسال شد؛ دستیار برای مشتری جایگزین پیدا می‌کند')
      onDone()
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Card className="animate-fade-up ring-1 ring-brand-200" style={stagger(index)}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-bold">{i.product_title}</p>
        <span className="shrink-0 text-xs text-ink-3">{agoTs(i.created_at)}</span>
      </div>
      <pre className="mt-2 rounded-xl bg-slate-50 p-3 font-sans text-xs leading-6 whitespace-pre-wrap text-ink-2">{i.message}</pre>
      {i.visit_at && <Badge tone="orange" className="mt-2">مشتری حدود {i.visit_at} مراجعه می‌کند</Badge>}

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button onClick={() => setAvailable(true)} aria-pressed={available} className={`flex min-h-11 items-center justify-center gap-1.5 rounded-xl border-2 text-sm font-bold ${available ? 'border-ok-700 bg-ok-50 text-ok-800' : 'border-line'}`}><CheckCircle2 size={17} />موجود است</button>
        <button onClick={() => { setAvailable(false); setNote(QUICK[2]) }} aria-pressed={!available} className={`flex min-h-11 items-center justify-center gap-1.5 rounded-xl border-2 text-sm font-bold ${!available ? 'border-red-600 bg-red-50 text-red-700' : 'border-line'}`}><XCircle size={17} />ناموجود</button>
      </div>
      {available && (
        <>
          <label className="mt-3 block text-sm">
            <span className="mb-1 block font-medium">قیمت نهایی امروز (تومان)</span>
            <input inputMode="numeric" value={price} onChange={e => setPrice(e.target.value)} className="h-11 w-full rounded-xl border border-line px-3 ltr-nums" />
            {i.listed_price && <span className="text-xs text-ink-3">قیمت ثبت‌شده شما در ترب: {toman(i.listed_price)}</span>}
          </label>
          {i.visit_at && <div className="mt-2"><Toggle checked={hold} onChange={setHold} label={`تا ${i.visit_at} برای مشتری کنار می‌گذارم`} /></div>}
          {i.question_keys.includes('installment') && (
            <label className="mt-2 block text-sm"><span className="mb-1 block font-medium">پاسخ درباره اقساط</span>
              <input value={installment} onChange={e => setInstallment(e.target.value)} placeholder="مثلاً: بله، با ترب‌پی" className="h-11 w-full rounded-xl border border-line px-3" /></label>
          )}
        </>
      )}
      <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4">
        {QUICK.map(q => <Chip key={q} active={note === q} onClick={() => setNote(q)}>{q}</Chip>)}
      </div>
      <Btn className="mt-3 w-full" loading={busy} onClick={send}>{busy ? 'در حال ارسال…' : 'ارسال پاسخ به مشتری'}</Btn>
    </Card>
  )
}
