import { StrictMode, Suspense, lazy, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom'
import './index.css'
import { StoreProvider } from './lib/store'
import { ToastProvider } from './lib/toast'
import { BottomNav, LocationSheet } from './components/Layout'
import { ErrorBoundary, NotFound, PageFallback } from './components/Shell'
import Home from './pages/Home'

// Home is in the main bundle for a fast first paint; other pages (and Leaflet) load on demand.
const Results = lazy(() => import('./pages/Results'))
const Product = lazy(() => import('./pages/Product'))
const Shop = lazy(() => import('./pages/Shop'))
const Compare = lazy(() => import('./pages/Compare'))
const Seller = lazy(() => import('./pages/Seller'))
const TrackList = lazy(() => import('./pages/Track').then(m => ({ default: m.TrackList })))
const TrackDetail = lazy(() => import('./pages/Track').then(m => ({ default: m.TrackDetail })))

function AnimatedRoutes() {
  const location = useLocation()
  useEffect(() => { window.scrollTo(0, 0) }, [location.pathname])
  return (
    <div key={location.pathname} className="animate-page">
      <ErrorBoundary>
        <Suspense fallback={<PageFallback />}>
          <Routes location={location}>
            <Route path="/" element={<Home />} />
            <Route path="/s" element={<Results />} />
            <Route path="/p/:id" element={<Product />} />
            <Route path="/shop/:id" element={<Shop />} />
            <Route path="/compare" element={<Compare />} />
            <Route path="/track" element={<TrackList />} />
            <Route path="/track/:id" element={<TrackDetail />} />
            <Route path="/seller" element={<Seller />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </ErrorBoundary>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreProvider>
      <ToastProvider>
        <BrowserRouter>
          <AnimatedRoutes />
          <BottomNav />
          <LocationSheet />
        </BrowserRouter>
      </ToastProvider>
    </StoreProvider>
  </StrictMode>,
)
