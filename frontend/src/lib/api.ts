export type Fresh = { level: 'fresh' | 'recent' | 'old' | 'stale' | 'unknown'; days: number | null; label: string }
export type OpenStatus = { state: 'open' | 'closed' | 'unknown'; label: string; closes_at?: string; opens_at?: string; closing_soon?: boolean }
export type Near = { count: number; nearest_m: number | null; open_now: number }

export type ProductCard = {
  product_id: string; title: string; brand: string | null; category: string | null; image: string | null
  price: { min: number | null; median: number | null; max: number | null; priced_offers: number; wide_spread: boolean }
  offer_count: number; freshness: Fresh; near: Near; why?: string
}
export type Spec = { key: string; value: string; section?: string }
export type ProductDetail = ProductCard & { images: string[]; model: string | null; specs: Spec[] }

export type ShopBrief = {
  shop_id: string; name: string; name_is_real: boolean; address: string | null; area: string | null
  lat: number; lon: number; passage: string | null; floor: string | null; unit: string | null; plaque: string | null
  open: OpenStatus; installment: string[]; installment_channels: string[]; fast_delivery: boolean | null
  offer_count: number; distance_m: number; travel_min: number; travel_mode: 'walk' | 'ride'; stock?: string
}
export type Offer = {
  offer_id: string; price: number | null; price_flag: string; price_ok: boolean; seller_title: string
  description: string | null; warranty: string | null; freshness: Fresh; shop: ShopBrief; score: number
  reasons: string[]; cautions: string[]; stock: string; badge?: string; other_listings: number
}
export type OffersResp = {
  items: Offer[]; hidden: Record<string, number>; total: number
  clusters: { passage: string; shop_ids: string[]; count: number }[]; maybe: ShopBrief[]
}
export type SearchResp = {
  query: string; total: number; items: ProductCard[]
  facets: { categories: { name: string; count: number }[]; brands: { name: string; count: number }[] }
}
export type Intent = {
  keywords: string; alt_keywords: string[]; budget_min: number | null; budget_max: number | null
  brand: string | null; use_case: string | null; must_have: string[]; understood: string | null
  advice: string | null; questions: { q: string; options: string[] }[]; source: 'llm' | 'rules'
}
export type Reco = { picks: { product_id: string; reason: string }[]; tip?: string | null; source?: string }
export type ShopDetail = ShopBrief & {
  categories: string[]; phone: string | null; instagram: string | null; website: string | null
  week: { day: string; status: string; text: string }[]
  payments: { provider_name: string; channel: string }[]
  links: Record<string, string>
  neighbours: { shop_id: string; name: string; floor: string | null; unit: string | null }[]
  products: { product_id: string; title: string; image: string | null; price: number | null; price_ok: boolean; freshness: Fresh }[]
}
export type Reply = {
  available: boolean; price?: number; installment?: string; warranty?: string; colors?: string[]
  hold_until?: string; hours?: string; note?: string; simulated?: boolean
}
export type Inquiry = {
  id: string; batch_id: string; product_id: string; product_title: string; offer_id: string
  listed_price: number | null; questions: string[]; question_keys: string[]; visit_at: string | null
  note: string | null; message: string; status: 'sent' | 'seen' | 'answered' | 'no_answer'
  created_at: number; seen_at: number | null; answered_at: number | null; reply: Reply | null; shop: ShopBrief
}
export type Batch = {
  batch_id: string; product_id: string; product_title: string; created_at: number; visit_at: string | null
  items: Inquiry[]; counts: { total: number; done: number; available: number; pending: number }
  agent?: {
    state: 'waiting' | 'found' | 'none'; message: string; best: string | null
    route: { stops: { inquiry_id: string; shop_id: string; name: string; passage: string | null; open: OpenStatus }[]; link: string } | null
    more_shops: Offer[]; alternatives: ProductCard[]
  }
}
export type Area = { name: string; n: number; lat: number; lon: number }

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) } })
  if (!r.ok) {
    let msg = 'خطا در ارتباط با سرور'
    try { msg = (await r.json()).detail || msg } catch { /* ignore */ }
    throw new Error(typeof msg === 'string' ? msg : 'درخواست نامعتبر')
  }
  return r.json()
}

export function qs(params: Record<string, unknown>) {
  const u = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '' || v === false) continue
    if (Array.isArray(v)) v.forEach(x => u.append(k, String(x)))
    else u.set(k, String(v))
  }
  return u.toString()
}

export const api = {
  understand: (message: string, fast = false) =>
    req<Intent>('/api/assist/understand', { method: 'POST', body: JSON.stringify({ message, fast }) }),
  recommend: (need: string, product_ids: string[], lat: number, lon: number) =>
    req<Reco>('/api/assist/recommend', { method: 'POST', body: JSON.stringify({ need, product_ids, lat, lon }) }),
  search: (p: Record<string, unknown>) => req<SearchResp>('/api/search?' + qs(p)),
  product: (id: string) => req<ProductDetail>(`/api/products/${id}`),
  offers: (id: string, p: Record<string, unknown>) => req<OffersResp>(`/api/products/${id}/offers?` + qs(p)),
  alternatives: (id: string, p: Record<string, unknown>) => req<ProductCard[]>(`/api/products/${id}/alternatives?` + qs(p)),
  compare: (ids: string[], lat: number, lon: number) => req<ProductDetail[]>('/api/compare?' + qs({ ids, lat, lon })),
  shop: (id: string, lat: number, lon: number) => req<ShopDetail>(`/api/shops/${id}?` + qs({ lat, lon })),
  areas: () => req<Area[]>('/api/areas'),
  questions: () => req<Record<string, string>>('/api/inquiry-questions'),
  createInquiry: (body: unknown) => req<{ batch_id: string }>('/api/inquiries', { method: 'POST', body: JSON.stringify(body) }),
  inquiries: (client_id: string) => req<Batch[]>('/api/inquiries?' + qs({ client_id })),
  batch: (id: string) => req<Batch>(`/api/inquiries/${id}`),
  sellerShops: () => req<{ shop_id: string; name: string; count: number }[]>('/api/seller/shops'),
  sellerInbox: (shop_id: string) => req<{ shop: ShopBrief; items: Inquiry[] }>(`/api/seller/${shop_id}/inbox`),
  sellerReply: (id: string, body: unknown) => req(`/api/seller/inquiries/${id}/reply`, { method: 'POST', body: JSON.stringify(body) }),
  sellerRelease: (shop_id: string) => req(`/api/seller/${shop_id}/release`, { method: 'POST' }),
}
