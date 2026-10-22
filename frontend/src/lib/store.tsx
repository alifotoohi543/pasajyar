import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

export type Loc = { lat: number; lon: number; label: string; source: 'default' | 'gps' | 'area' | 'map' }
export type Filters = { installment: boolean; openNow: boolean; warranty: boolean; radiusKm: number | null }

const DEFAULT_LOC: Loc = { lat: 35.701, lon: 51.418, label: 'میدان فردوسی', source: 'default' }
const DEFAULT_FILTERS: Filters = { installment: false, openNow: false, warranty: false, radiusKm: null }

function load<T>(k: string, d: T): T {
  try {
    const v = localStorage.getItem(k)
    return v ? { ...d, ...JSON.parse(v) } : d
  } catch {
    return d
  }
}
function save(k: string, v: unknown) {
  try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* private mode */ }
}
function clientId() {
  try {
    let id = localStorage.getItem('pj.client')
    if (!id) { id = crypto.randomUUID(); localStorage.setItem('pj.client', id) }
    return id
  } catch {
    return 'anon-' + Math.random().toString(36).slice(2)
  }
}

type Ctx = {
  loc: Loc; setLoc: (l: Loc) => void
  filters: Filters; setFilters: (f: Partial<Filters>) => void
  compare: string[]; toggleCompare: (id: string) => void; clearCompare: () => void
  clientId: string
  locSheet: boolean; openLocSheet: (v: boolean) => void
  locate: () => Promise<void>; locating: boolean
}
const C = createContext<Ctx | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [loc, setLocS] = useState<Loc>(() => load('pj.loc', DEFAULT_LOC))
  const [filters, setF] = useState<Filters>(() => load('pj.filters', DEFAULT_FILTERS))
  const [compare, setCompare] = useState<string[]>([])
  const [locSheet, openLocSheet] = useState(false)
  const [locating, setLocating] = useState(false)
  const [cid] = useState(clientId)

  useEffect(() => { save('pj.loc', loc) }, [loc])
  useEffect(() => { save('pj.filters', filters) }, [filters])

  const setFilters = useCallback((f: Partial<Filters>) => setF(o => ({ ...o, ...f })), [])
  const toggleCompare = useCallback((id: string) =>
    setCompare(c => (c.includes(id) ? c.filter(x => x !== id) : [...c, id].slice(-4))), [])

  const locate = useCallback(() => new Promise<void>((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('مرورگر از موقعیت‌یابی پشتیبانی نمی‌کند'))
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      p => {
        setLocS({ lat: p.coords.latitude, lon: p.coords.longitude, label: 'موقعیت فعلی من', source: 'gps' })
        setLocating(false)
        resolve()
      },
      () => { setLocating(false); reject(new Error('دسترسی به موقعیت داده نشد')) },
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }), [])

  const v = useMemo(() => ({
    loc, setLoc: setLocS, filters, setFilters, compare, toggleCompare, clearCompare: () => setCompare([]),
    clientId: cid, locSheet, openLocSheet, locate, locating,
  }), [loc, filters, setFilters, compare, toggleCompare, cid, locSheet, locate, locating])
  return <C.Provider value={v}>{children}</C.Provider>
}

export function useStore() {
  const v = useContext(C)
  if (!v) throw new Error('StoreProvider missing')
  return v
}

/** Tiny fetch hook with stale-response protection. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [state, set] = useState<{ data?: T; error?: string; loading: boolean }>({ loading: true })
  useEffect(() => {
    let alive = true
    set(s => ({ ...s, loading: true, error: undefined }))
    fn().then(
      data => alive && set({ data, loading: false }),
      e => alive && set({ error: e.message || 'خطا', loading: false }),
    )
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return state
}
