/**
 * 卡片容器组件。
 * 精致的微阴影 + 微妙边框，hover 时提升阴影深度。
 */
import type { ComponentPropsWithoutRef, ReactNode } from 'react'
import { cn } from '@/src/lib/utils'

interface CardProps extends ComponentPropsWithoutRef<'div'> {
  title?: string
  action?: ReactNode
  /** 是否启用 hover 阴影提升效果。 */
  interactive?: boolean
  children: ReactNode
}

export const Card = ({ title, action, interactive = false, children, className, ...props }: CardProps) => {
  return (
    <div
      className={cn(
        'rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)]',
        'shadow-[var(--shadow-card)]',
        interactive && 'transition-shadow duration-200 hover:shadow-[var(--shadow-card-hover)]',
        className,
      )}
      {...props}
    >
      {title && (
        <div className="flex items-center justify-between border-b border-[var(--color-border-light)] px-5 py-3.5">
          <h3 className="text-[14px] font-semibold text-[var(--color-text-primary)]">
            {title}
          </h3>
          {action && <div className="flex-shrink-0">{action}</div>}
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  )
}
