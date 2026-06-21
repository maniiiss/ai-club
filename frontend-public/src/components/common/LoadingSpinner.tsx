/**
 * 加载旋转器组件。
 * 用于页面级或区域级加载状态展示。
 */
import { cn } from '@/src/lib/utils'

interface LoadingSpinnerProps {
  /** 加载提示文本。 */
  text?: string
  /** 是否为全屏居中模式。 */
  fullscreen?: boolean
  /** 尺寸，默认 md。 */
  size?: 'sm' | 'md' | 'lg'
}

const sizeMap = {
  sm: 'h-5 w-5',
  md: 'h-8 w-8',
  lg: 'h-12 w-12',
}

export const LoadingSpinner = ({ text, fullscreen = false, size = 'md' }: LoadingSpinnerProps) => {
  const spinner = (
    <svg
      className={cn('animate-spin text-[var(--color-primary)]', sizeMap[size])}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  )

  if (fullscreen) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3">
        {spinner}
        {text && (
          <p className="text-[13px] text-[var(--color-text-tertiary)]">{text}</p>
        )}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 py-4">
      {spinner}
      {text && (
        <p className="text-[13px] text-[var(--color-text-tertiary)]">{text}</p>
      )}
    </div>
  )
}
