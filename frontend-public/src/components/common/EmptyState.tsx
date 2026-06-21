/**
 * 空状态组件。
 */
import type { ReactNode } from 'react'
import { Inbox } from 'lucide-react'

interface EmptyStateProps {
  title: string
  description?: string
  icon?: ReactNode
  action?: ReactNode
}

export const EmptyState = ({ title, description, icon, action }: EmptyStateProps) => {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--color-bg-hover)] text-[var(--color-text-tertiary)]">
        {icon || <Inbox className="h-7 w-7" strokeWidth={1.5} />}
      </div>
      <h3 className="text-[16px] font-semibold text-[var(--color-text-primary)]">
        {title}
      </h3>
      {description && (
        <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-[var(--color-text-tertiary)]">
          {description}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
