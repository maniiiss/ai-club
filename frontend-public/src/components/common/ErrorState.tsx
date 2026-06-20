/**
 * 错误状态组件。
 */
import type { ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from './Button'

interface ErrorStateProps {
  title?: string
  description?: string
  icon?: ReactNode
  onRetry?: () => void
  retryText?: string
}

export const ErrorState = ({
  title = '加载失败',
  description = '请求出错，请稍后重试或联系支持。',
  icon,
  onRetry,
  retryText = '重试',
}: ErrorStateProps) => {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--color-danger-light)] text-[var(--color-danger)]">
        {icon || <AlertTriangle className="h-7 w-7" strokeWidth={1.5} />}
      </div>
      <h3 className="text-[16px] font-semibold text-[var(--color-text-primary)]">
        {title}
      </h3>
      <p className="mt-1.5 max-w-sm text-[13px] text-[var(--color-text-tertiary)]">
        {description}
      </p>
      {onRetry && (
        <div className="mt-5">
          <Button variant="secondary" onClick={onRetry}>
            {retryText}
          </Button>
        </div>
      )}
    </div>
  )
}
