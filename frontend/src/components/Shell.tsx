import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { CloudOff, MapPinOff, RotateCw } from 'lucide-react'
import { AppBar, Page } from './Layout'
import { Btn, Empty, Skeleton } from './ui'

export function PageFallback() {
  return (
    <>
      <div className="h-14 border-b border-line/70 bg-white/90" />
      <Page>
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="mt-4 h-40" />
        <Skeleton className="mt-3 h-28" />
        <Skeleton className="mt-3 h-28" />
      </Page>
    </>
  )
}

export function NotFound() {
  return (
    <>
      <AppBar />
      <Page>
        <Empty icon={<MapPinOff size={26} />} title="این صفحه پیدا نشد"
          text="ممکن است آدرس اشتباه باشد یا صفحه جابه‌جا شده باشد."
          action={<Link to="/"><Btn>بازگشت به جستجو</Btn></Link>} />
      </Page>
    </>
  )
}

/** Keeps a rendering bug in one page from blanking the whole app. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('UI error', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <>
        <AppBar />
        <Page>
          <Empty icon={<CloudOff size={26} />} title="مشکلی پیش آمد"
            text="نمایش این صفحه با خطا روبه‌رو شد. دوباره امتحان کن."
            action={<Btn icon={<RotateCw size={17} />} onClick={() => location.reload()}>بارگذاری دوباره</Btn>} />
        </Page>
      </>
    )
  }
}
