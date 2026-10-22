import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Send, Eye, ShieldCheck } from 'lucide-react'
import { Btn, Chip, Sheet } from './ui'
import { api, type Offer, type ProductDetail } from '../lib/api'
import { useStore } from '../lib/store'
import { useToast } from '../lib/toast'
import { faNum } from '../lib/format'

const LABELS: Record<string, string> = {
  stock: 'موجودی', price: 'قیمت نهایی', installment: 'خرید اقساطی', warranty: 'گارانتی',
  color: 'رنگ/مدل', hours: 'ساعت کاری امروز', hold: 'کنار گذاشتن کالا',
}

function visitOptions() {
  const now = new Date()
  const h = now.getHours()
  const opts: string[] = []
  if (h < 20) opts.push(`${String(Math.min(h + 1, 21)).padStart(2, '0')}:00`)
  if (h < 16) opts.push('17:00')
  if (h < 12) opts.push('12:00')
  opts.push('فردا صبح', 'فردا عصر')
  return opts
}

export default function InquirySheet({ open, onClose, product, offers }: { open: boolean; onClose: () => void; product: ProductDetail; offers: Offer[] }) {
  const nav = useNavigate()
  const { clientId, loc, filters } = useStore()
  const toast = useToast()
  const [qs, setQs] = useState<string[]>(['stock', 'price'])
  const [visit, setVisit] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [preview, setPreview] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const visits = useMemo(() => visitOptions(), [open])

  useEffect(() => {
    if (open) setQs(q => Array.from(new Set([...q, ...(filters.installment ? ['installment'] : [])])))
  }, [open, filters.installment])

  const toggle = (k: string) => setQs(q => (q.includes(k) ? q.filter(x => x !== k) : [...q, k]))
  const send = async () => {
    setBusy(true); setErr('')
    try {
      const { batch_id } = await api.createInquiry({
        client_id: clientId, product_id: product.product_id, offer_ids: offers.map(o => o.offer_id),
        questions: visit ? Array.from(new Set([...qs, 'hold'])) : qs.filter(q => q !== 'hold'),
        visit_at: visit, note: note.trim() || null, lat: loc.lat, lon: loc.lon,
      })
      toast(`استعلام برای ${faNum(offers.length)} فروشگاه ارسال شد`)
      nav(`/track/${batch_id}`)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const msg = [
    'سلام، وقت بخیر.', `از طرف یک مشتری درباره «${product.title}» پیام می‌دهم.`,
    ...qs.filter(q => q !== 'hold').map((q, i) => `${faNum(i + 1)}. ${LABELS[q]}؟`),
    visit ? `اگر موجود است تا ${visit} کنار بگذارید؛ مشتری حضوری می‌آید.` : '',
    note.trim() ? `توضیح: ${note.trim()}` : '',
  ].filter(Boolean)

  return (
    <Sheet open={open} onClose={onClose} title={`استعلام از ${faNum(offers.length)} فروشگاه`}
      footer={
        <>
          {err && <p role="alert" className="mb-2 text-sm text-red-700">{err}</p>}
          <Btn variant="primary" className="w-full" icon={<Send size={18} />} loading={busy} disabled={!qs.length} onClick={send}>
            {busy ? 'در حال ارسال…' : 'ارسال و پیگیری توسط دستیار'}
          </Btn>
        </>
      }>
      <div className="flex flex-wrap gap-1.5 text-xs text-ink-3">
        {offers.map(o => <span key={o.offer_id} className="rounded-full bg-slate-100 px-2 py-1">{o.shop.name}</span>)}
      </div>

      <h3 className="mt-4 mb-2 text-sm font-bold">چه چیزی بپرسم؟</h3>
      <div className="flex flex-wrap gap-2">
        {Object.entries(LABELS).filter(([k]) => k !== 'hold').map(([k, l]) => <Chip key={k} active={qs.includes(k)} onClick={() => toggle(k)}>{l}</Chip>)}
      </div>

      <h3 className="mt-5 mb-1 text-sm font-bold">کی می‌روی؟ <span className="font-normal text-ink-3">(اختیاری)</span></h3>
      <p className="mb-2 text-xs text-ink-3">به فروشنده خبر می‌دهم که می‌آیی و می‌خواهم کالا را برایت کنار بگذارد.</p>
      <div className="flex flex-wrap gap-2">
        {visits.map(v => <Chip key={v} active={visit === v} onClick={() => setVisit(visit === v ? null : v)}>{v}</Chip>)}
      </div>

      <label className="mt-5 block">
        <span className="mb-2 block text-sm font-bold">توضیح برای فروشنده <span className="font-normal text-ink-3">(اختیاری)</span></span>
        <input value={note} onChange={e => setNote(e.target.value)} maxLength={200} placeholder="مثلاً: رنگ مشکی می‌خواهم"
          className="h-11 w-full rounded-xl border border-line px-3 text-sm focus:border-brand-600 focus:outline-none" />
      </label>

      <button onClick={() => setPreview(v => !v)} className="mt-4 flex items-center gap-1.5 text-sm font-medium text-brand-700"><Eye size={16} />{preview ? 'بستن پیش‌نمایش' : 'پیش‌نمایش پیام'}</button>
      {preview && <pre className="mt-2 animate-reveal rounded-xl bg-slate-50 p-3 font-sans text-xs leading-6 whitespace-pre-wrap text-ink-2 ring-1 ring-line">{msg.join('\n')}</pre>}

      <p className="mt-4 flex gap-1.5 text-xs leading-5 text-ink-3">
        <ShieldCheck size={15} className="shrink-0" aria-hidden />
        شماره شما برای فروشنده ارسال نمی‌شود. پاسخ‌ها در بخش «استعلام‌ها» جمع می‌شوند و اگر کسی کالا را نداشت، دستیار جایگزین پیشنهاد می‌دهد.
      </p>
    </Sheet>
  )
}
