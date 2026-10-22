const fa = new Intl.NumberFormat('fa-IR')

export const faNum = (n: number | string) => (typeof n === 'number' ? fa.format(n) : n.replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[+d]))

export function toman(n: number | null | undefined) {
  if (n == null) return 'نامشخص'
  return `${fa.format(n)} تومان`
}

/** Compact: 3,765,000 → «۳٫۸ میلیون» */
export function tomanShort(n: number | null | undefined) {
  if (n == null) return '—'
  if (n >= 1e9) return `${fa.format(+(n / 1e9).toFixed(1))} میلیارد`
  if (n >= 1e6) return `${fa.format(+(n / 1e6).toFixed(n >= 1e8 ? 0 : 1))} میلیون`
  if (n >= 1e3) return `${fa.format(Math.round(n / 1e3))} هزار`
  return fa.format(n)
}

export function dist(m: number | null | undefined) {
  if (m == null) return '—'
  return m < 1000 ? `${fa.format(Math.round(m / 10) * 10)} متر` : `${fa.format(+(m / 1000).toFixed(1))} کیلومتر`
}

export function travel(min: number, mode: 'walk' | 'ride') {
  return `${fa.format(min)} دقیقه ${mode === 'walk' ? 'پیاده' : 'با تاکسی/مترو'}`
}

export function agoTs(ts: number) {
  const s = Math.max(0, Date.now() / 1000 - ts)
  if (s < 60) return 'همین الان'
  if (s < 3600) return `${fa.format(Math.floor(s / 60))} دقیقه پیش`
  if (s < 86400) return `${fa.format(Math.floor(s / 3600))} ساعت پیش`
  return `${fa.format(Math.floor(s / 86400))} روز پیش`
}

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')
