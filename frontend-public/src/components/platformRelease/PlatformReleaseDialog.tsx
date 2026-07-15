import { useEffect } from 'react'
import { X } from 'lucide-react'
import { Markdown } from '@/src/components/common/Markdown'
import type { PlatformRelease } from '@/src/types/platformRelease'

interface PlatformReleaseDialogProps {
  release: PlatformRelease
  onClose: () => void
}

/**
 * 公众端版本发布弹窗。
 * 业务意图：把新版本内容放在用户首次进入产品后的明确入口中，关闭也视为已展示。
 */
export const PlatformReleaseDialog = ({ release, onClose }: PlatformReleaseDialogProps) => {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/45 px-4 py-6 backdrop-blur-sm" role="presentation">
      <div
        className="flex max-h-[min(760px,calc(100vh-48px))] w-full max-w-[720px] flex-col overflow-hidden rounded-2xl border border-white/70 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.24)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="platform-release-title"
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-[var(--color-border-light)] px-6 py-5">
          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-2">
              <span className="rounded-full bg-[var(--color-primary-light)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--color-primary)]">
                New release
              </span>
              <span className="text-[11px] font-medium text-[var(--color-text-tertiary)]">{release.version}</span>
            </div>
            <h2 id="platform-release-title" className="text-[20px] font-semibold leading-tight text-[var(--color-text-primary)]">
              {release.title}
            </h2>
            <p className="mt-2 text-[11px] text-[var(--color-text-tertiary)]">发布时间：{release.publishedAt}</p>
          </div>
          <button
            type="button"
            aria-label="关闭版本发布提示"
            onClick={onClose}
            className="shrink-0 rounded-lg p-2 text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
          >
            <X className="h-5 w-5" strokeWidth={1.8} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <Markdown content={release.content} normalize={false} className="text-[13px] leading-6" />
        </div>

        <footer className="flex shrink-0 justify-end border-t border-[var(--color-border-light)] px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-[var(--color-primary)] px-5 py-2.5 text-[12px] font-semibold text-white shadow-sm transition-colors hover:opacity-90"
          >
            我知道了
          </button>
        </footer>
      </div>
    </div>
  )
}
